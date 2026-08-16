import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  appendRetryEvent,
  createAnalysis,
  deleteAnalysis as dbDeleteAnalysis,
  getAnalysisById,
  getUserStats,
  getThumbnailsByAnalysis,
  getVideosByAnalysis,
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
    const analysisId = nanoid(14);
    const niche = input.niche;

    await createAnalysis({ id: analysisId, userId, niche, status: "running" });

    try {
      const [llmConfig, imageConfig] = await Promise.all([
        resolveLlmConfig(userId),
        resolveImageConfig(userId),
      ]);
      await runAnalysisAsync(analysisId, niche, { llmConfig, imageConfig });
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
      const newId = nanoid(14);
      await createAnalysis({ id: newId, userId, niche: row.niche, status: "running" });
      try {
        const [llmConfig, imageConfig] = await Promise.all([
          resolveLlmConfig(userId),
          resolveImageConfig(userId),
        ]);
        await runAnalysisAsync(newId, row.niche, { llmConfig, imageConfig });
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
};

async function runAnalysisAsync(
  analysisId: string,
  niche: string,
  configs: AnalysisConfigs
) {
  try {
    await updateAnalysisProgress(analysisId, 15);
    const videos = await fetchTrendingVideosForNiche(niche, 12, (event) => {
      appendRetryEvent(analysisId, {
        attempt: event.attempt,
        at: event.at,
        type: event.type,
        message: event.message,
        reason: event.reason,
        waitSeconds: event.waitSeconds,
      }).catch(() => undefined);
    });
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
    await updateAnalysisProgress(analysisId, 90);
    await updateAnalysis(analysisId, { status: "completed", result: JSON.stringify(result) });
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
