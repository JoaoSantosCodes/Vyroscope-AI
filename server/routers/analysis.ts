import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  appendRetryEvent,
  checkAnalysisLimits,
  checkAnalysisLimitsExtended,
  type BlockDimension,
  createAnalysis,
  getUserLimits,
  getUsageForBlock,
  recordApiUsage,
  confirmBlockedAttempt,
  getLatestBlockedAttemptId,
  recordBlockedAttempt,
  deleteAnalysis as dbDeleteAnalysis,
  getAnalysisById,
  getUserStats,
  getThumbnailsByAnalysis,
  getVideosByAnalysis,
  buildAnalysisHistoryCsv,
  listAnalysesByUser,
  parseRetrySummary,
  saveVideos,
  updateAnalysis,
  updateAnalysisProgress,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { analyzeNiche, type AnalysisResult } from "../analysis";
import { resolveImageConfig, resolveLlmConfig } from "../providers";
import { fetchTrendingVideosForNiche } from "../youtube";

/** (Rodada 37) Grava a tentativa bloqueada (ou pedida de confirmação) com o
 * limite e o consumo atual da dimensão que disparou o gatilho. */
async function recordBlockedAttemptFor(
  userId: number,
  niche: string,
  check: { blocked: true; reason: string; dimension: BlockDimension } | { needsConfirmation: true; reason: string; dimension: BlockDimension }
): Promise<number | null> {
  const limits = await getUserLimits(Number(userId));
  const limitValue =
    check.dimension === "analyses"
      ? limits.dailyAnalysisLimit
      : check.dimension === "tokens"
        ? limits.dailyTokenLimit
        : check.dimension === "quota"
          ? limits.dailyQuotaLimit
          : check.dimension === "weekly_tokens"
            ? limits.weeklyTokenLimit
            : check.dimension === "weekly_quota"
              ? limits.weeklyQuotaLimit
              : check.dimension === "monthly_tokens"
                ? limits.monthlyTokenLimit
                : limits.monthlyQuotaLimit;
  const currentUsage = await getUsageForBlock(Number(userId), check.dimension);
  try {
    await recordBlockedAttempt({
      userId: Number(userId),
      dimension: check.dimension,
      limitValue,
      currentUsage,
      reason: check.reason,
      attemptedAt: Date.now(),
      niche,
    });
    // Recupera o id da tentativa recém-registrada (última do usuário/nicho).
    const latest = await getLatestBlockedAttemptId(Number(userId), niche);
    return latest;
  } catch {
    return null;
  }
}

const inputSchema = z.object({
  niche: z.string().trim().min(2, "O nicho deve ter pelo menos 2 caracteres").max(120, "Nicho muito longo"),
});

export const analysisRouter = router({
  /**
   * Executa uma análise completa: busca vídeos em alta no nicho via YouTube
   * Data API, pontua cada vídeo, extrai padrões e gera sugestões.
   * A execução é síncrona (o servidor aguarda o fim) para garantir confiabilidade
   * no runtime gerenciado; a duração típica fica dentro do timeout de requisição.
   */
  run: protectedProcedure.input(inputSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const niche = input.niche;
    // (Rodada 36/37) Proteção de custos: bloqueia a análise quando qualquer limite
    // diário atingiu 100%; no modo "apenas avisar" pede confirmação (needsConfirmation).
    // (Rodada 39) Considera também orçamentos semanal e mensal.
    const limitCheck = await checkAnalysisLimitsExtended(Number(userId));
    if ("blocked" in limitCheck && limitCheck.blocked) {
      await recordBlockedAttemptFor(userId, niche, limitCheck);
      await createAnalysis({ id: nanoid(14), userId, niche, status: "failed" }).catch(() => undefined);
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: limitCheck.reason });
    }
    if ("needsConfirmation" in limitCheck && limitCheck.needsConfirmation) {
      const pendingId = await recordBlockedAttemptFor(userId, niche, limitCheck);
      // (Rodada 38) Override de uso único autoriza a próxima análise: registra
      // a pendência confirmada (analysisId) e executa normalmente.
      const newAnalysisId = nanoid(14);
      if (pendingId !== null) {
        await confirmBlockedAttempt(pendingId, { confirmedAt: Date.now(), analysisId: newAnalysisId }).catch(() => undefined);
      }
      await createAnalysis({ id: newAnalysisId, userId, niche, status: "running" });
      try {
        const [llmConfig, imageConfig] = await Promise.all([resolveLlmConfig(userId), resolveImageConfig(userId)]);
        await runAnalysisAsync(newAnalysisId, niche, { llmConfig, imageConfig, userId: Number(userId) });
      } catch {
        /* erros já gravados via updateAnalysis */
      }
      const final = await getAnalysisById(newAnalysisId);
      return { id: newAnalysisId, niche, status: final?.status ?? ("failed" as const) };
    }
    const analysisId = nanoid(14);
    await createAnalysis({ id: analysisId, userId, niche, status: "running" });

    try {
      const [llmConfig, imageConfig] = await Promise.all([
        resolveLlmConfig(userId),
        resolveImageConfig(userId),
      ]);
      await runAnalysisAsync(analysisId, niche, { llmConfig, imageConfig, userId: Number(userId) });
    } catch {
      /* erros já gravados via updateAnalysis */
    }

    const final = await getAnalysisById(analysisId);
    return {
      id: analysisId,
      niche,
      status: final?.status ?? ("failed" as const),
    };
  }),

  /**
   * (Rodada 32) Tenta novamente uma análise falhada: cria uma nova execução
   * com o mesmo nicho do usuário, reutilizando os provedores configurados.
   */
  retry: protectedProcedure
    .input(z.object({ analysisId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await getAnalysisById(input.analysisId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada" });
      if (row.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta análise" });
      }
      const userId = ctx.user.id;
      // (Rodada 36/37) O retry também respeita os limites diários.
      // (Rodada 39) Considera também orçamentos semanal e mensal.
      const limitCheck = await checkAnalysisLimitsExtended(Number(userId));
      if ("blocked" in limitCheck && limitCheck.blocked) {
        await recordBlockedAttemptFor(userId, row.niche, limitCheck);
        await createAnalysis({ id: nanoid(14), userId, niche: row.niche, status: "failed" }).catch(() => undefined);
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: limitCheck.reason });
      }
      if ("needsConfirmation" in limitCheck && limitCheck.needsConfirmation) {
        const pendingId = await recordBlockedAttemptFor(userId, row.niche, limitCheck);
        // (Rodada 38) Override de uso único autoriza a próxima análise.
        const newId2 = nanoid(14);
        if (pendingId !== null) {
          await confirmBlockedAttempt(pendingId, { confirmedAt: Date.now(), analysisId: newId2 }).catch(() => undefined);
        }
        await createAnalysis({ id: newId2, userId, niche: row.niche, status: "running" });
        try {
          const [llmConfig, imageConfig] = await Promise.all([resolveLlmConfig(userId), resolveImageConfig(userId)]);
          await runAnalysisAsync(newId2, row.niche, { llmConfig, imageConfig, userId: Number(userId) });
        } catch {
          /* erros já gravados via updateAnalysis */
        }
        const final = await getAnalysisById(newId2);
        return { id: newId2, niche: row.niche, status: final?.status ?? ("failed" as const) };
      }
      const newId = nanoid(14);
      await createAnalysis({ id: newId, userId, niche: row.niche, status: "running" });
      try {
        const [llmConfig, imageConfig] = await Promise.all([
          resolveLlmConfig(userId),
          resolveImageConfig(userId),
        ]);
        await runAnalysisAsync(newId, row.niche, { llmConfig, imageConfig, userId: Number(userId) });
      } catch {
        /* erros já gravados via updateAnalysis */
      }
      const final = await getAnalysisById(newId);
      return {
        id: newId,
        niche: row.niche,
        status: final?.status ?? ("failed" as const),
      };
    }),

  /** Lista análises do usuário autenticado (histórico). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listAnalysesByUser(ctx.user.id);
    return rows.map((r) => ({
      id: r.id,
      niche: r.niche,
      status: r.status,
      retrySummary: parseRetrySummary(r.retryLog),
      createdAt: r.createdAt.getTime(),
    }));
  }),

  /**
   * (Rodada 35) Exporta o histórico de análises em CSV, incluindo o resumo
   * de retentativas (tentativas, falhas, desistência) e os títulos das
   * sugestões de cada análise concluída.
   */
  exportHistoryCsv: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listAnalysesByUser(ctx.user.id);
    const content = buildAnalysisHistoryCsv(rows);
    const when = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    return {
      filename: `vyroscope-historico-${when}.csv`,
      content,
    };
  }),

  /** Detalhe de uma análise (só do próprio usuário). */
  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await getAnalysisById(input.id);
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada" });
    }
    if (row.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta análise" });
    }
    const videos = await getVideosByAnalysis(row.id);
    const thumbnails = await getThumbnailsByAnalysis(row.id);
    let result: AnalysisResult | null = null;
    try {
      result = row.result ? (JSON.parse(row.result) as AnalysisResult) : null;
    } catch {
      result = null;
    }
    let retryLog: Array<{
      attempt: number;
      at: number;
      type: "retrying" | "giving_up" | "succeeded";
      message: string;
      reason?: string;
      waitSeconds?: number;
    }> | null = null;
    try {
      retryLog = row.retryLog ? (JSON.parse(row.retryLog) as typeof retryLog) : null;
    } catch {
      retryLog = null;
    }
    return {
      id: row.id,
      niche: row.niche,
      status: row.status,
      errorMessage: row.errorMessage,
      retryLog,
      createdAt: row.createdAt.getTime(),
      videos: videos.map((v) => ({
        ...v,
        score: result?.videoScores.find((s) => s.videoId === v.youtubeId)?.viralityScore ?? null,
      })),
      thumbnails: thumbnails.map((t) => ({
        id: t.id,
        suggestionTitle: t.suggestionTitle,
        imageUrl: t.imageUrl,
        prompt: t.prompt,
        favorite: t.favorite,
        createdAt: t.createdAt.getTime(),
      })),
      result,
    };
  }),

  /** Remove uma análise do histórico (só do próprio usuário). */
  remove: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const row = await getAnalysisById(input.id);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada" });
    if (row.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta análise" });
    }
    await dbDeleteAnalysis(input.id);
    return { success: true } as const;
  }),

  /** Progresso detalhado de uma análise em execução (etapas reais do backend). */
  progress: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await getAnalysisById(input.id);
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada" });
    }
    if (row.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta análise" });
    }
    return {
      id: row.id,
      status: row.status,
      progressStep: row.progressStep,
      errorMessage: row.errorMessage,
    };
  }),
});

type AnalysisConfigs = {
  llmConfig: { apiUrl: string; apiKey: string | undefined; model?: string };
  imageConfig: { apiUrl: string; apiKey: string | undefined; model?: string };
  /** (Rodada 35) usuário para o rastreamento de consumo. */
  userId?: number;
};

async function runAnalysisAsync(
  analysisId: string,
  niche: string,
  configs: AnalysisConfigs
): Promise<void> {
  const userIdNum = configs.userId ?? 0;
  if (!userIdNum) {
    // Sem usuário informado: não há como rastrear o consumo; apenas omitimos o registro.
  }
  try {
    await updateAnalysisProgress(analysisId, 15);
    let youtubeUnits = 0;
    const videos = await fetchTrendingVideosForNiche(
      niche,
      12,
      (event) => {
        appendRetryEvent(analysisId, {
          attempt: event.attempt,
          at: event.at,
          type: event.type,
          message: event.message,
          reason: event.reason,
          waitSeconds: event.waitSeconds,
        }).catch(() => undefined);
      },
      (usage) => {
        youtubeUnits += usage.units;
      }
    );
    await updateAnalysisProgress(analysisId, 45);
    await saveVideos(
      analysisId,
      videos.map((v) => ({
        analysisId,
        youtubeId: v.id,
        title: v.title,
        channelTitle: v.channelTitle,
        description: v.description,
        publishedAt: v.publishedAt,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        thumbnailUrl: v.thumbnailUrl,
      }))
    );

    await updateAnalysisProgress(analysisId, 60);
    const result = await analyzeNiche(niche, videos, configs);
    result.youtubeUnits = youtubeUnits;
    await updateAnalysisProgress(analysisId, 90);
    await updateAnalysis(analysisId, { status: "completed", result: JSON.stringify(result) });
    // (Rodada 35) Registra o consumo para o painel de status das APIs.
    if (userIdNum) {
      recordApiUsage({ userId: userIdNum, scope: "llm", tokens: result.llmTokens, requests: 1 }).catch(() => undefined);
      recordApiUsage({ userId: userIdNum, scope: "youtube", units: youtubeUnits, requests: 2 }).catch(() => undefined);
    }
    await updateAnalysisProgress(analysisId, 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isRateLimit = /429|rate.?limit|youtube_quota_or_key/i.test(message);
    const isInvalidKey = /youtube_invalid_key/i.test(message);
    const isMissingKey =
      /Neither OPENAI_API_KEY nor BUILT_IN_FORGE_API_KEY is configured|BUILT_IN_FORGE_API_KEY is not configured|BUILT_IN_FORGE_API_URL is not configured/i.test(
        message
      );
    await updateAnalysisProgress(analysisId, 0).catch(() => undefined);
    await updateAnalysis(analysisId, {
      status: "failed",
      errorMessage:
        message === "no_videos_found"
          ? "Nenhum vídeo em alta foi encontrado para este nicho. Tente outro termo ou amplie o nicho."
          : message.startsWith("llm_")
            ? "A análise de padrões falhou. Tente novamente em alguns instantes."
            : isMissingKey
              ? "O serviço de dados ainda não está configurado neste ambiente (chave de API ausente). Verifique as variáveis de ambiente do servidor (YOUTUBE_DATA_API_KEY / BUILT_IN_FORGE_API_KEY)."
              : isInvalidKey
                ? "A chave do YouTube Data API é inválida ou está ausente (YOUTUBE_DATA_API_KEY). Configure uma chave válida no console do Google Cloud."
                : isRateLimit
                  ? "O serviço de dados do YouTube atingiu o limite de requisições (quota) no momento. Aguarde alguns minutos e tente novamente."
                  : "Falha ao consultar o YouTube. Verifique sua conexão e tente novamente.",
    });
  }
}
