import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createAnalysis,
  deleteAnalysis as dbDeleteAnalysis,
  getAnalysisById,
  getUserStats,
  getVideosByAnalysis,
  listAnalysesByUser,
  saveVideos,
  updateAnalysis,
  updateAnalysisProgress,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { analyzeNiche, type AnalysisResult } from "../analysis";
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
      await runAnalysisAsync(analysisId, niche);
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

  /** Lista análises do usuário autenticado (histórico). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listAnalysesByUser(ctx.user.id);
    return rows.map((r) => ({
      ...r,
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
    let result: AnalysisResult | null = null;
    try {
      result = row.result ? (JSON.parse(row.result) as AnalysisResult) : null;
    } catch {
      result = null;
    }
    return {
      id: row.id,
      niche: row.niche,
      status: row.status,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.getTime(),
      videos: videos.map((v) => ({
        ...v,
        score: result?.videoScores.find((s) => s.videoId === v.youtubeId)?.viralityScore ?? null,
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

async function runAnalysisAsync(analysisId: string, niche: string) {
  try {
    await updateAnalysisProgress(analysisId, 15);
    const videos = await fetchTrendingVideosForNiche(niche, 12);
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
    const result = await analyzeNiche(niche, videos);
    await updateAnalysisProgress(analysisId, 90);
    await updateAnalysis(analysisId, { status: "completed", result: JSON.stringify(result) });
    await updateAnalysisProgress(analysisId, 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isRateLimit = /429|rate.?limit|quota/i.test(message);
    await updateAnalysisProgress(analysisId, 0).catch(() => undefined);
    await updateAnalysis(analysisId, {
      status: "failed",
      errorMessage:
        message === "no_videos_found"
          ? "Nenhum vídeo em alta foi encontrado para este nicho. Tente outro termo ou amplie o nicho."
          : message.startsWith("llm_")
            ? "A análise de padrões falhou. Tente novamente em alguns instantes."
            : isRateLimit
              ? "O serviço de dados do YouTube atingiu o limite de requisições no momento. Aguarde alguns minutos e tente novamente."
              : "Falha ao consultar o YouTube. Verifique sua conexão e tente novamente.",
    });
  }
}
