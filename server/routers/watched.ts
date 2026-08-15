import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addWatchedVideo,
  listWatchedVideos,
  removeWatchedVideo,
} from "../db";
import { fetchVideoStatsById } from "../youtube";
import { protectedProcedure, router } from "../_core/trpc";
import { watchedVideos } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const youtubeIdRegex = /^[a-zA-Z0-9_-]{6,20}$/;

const youtubeIdInput = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const match = /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/v\/)([a-zA-Z0-9_-]{6,20})/.exec(value);
  return match ? match[1] : value;
}, z.string().regex(youtubeIdRegex, "ID de vídeo do YouTube inválido (11 caracteres, ex: dQw4w9WgXcQ)."));

const addInput = z.object({
  youtubeId: youtubeIdInput,
  title: z.string().trim().min(1).max(255),
  suggestionTitle: z.string().trim().max(255).optional(),
  predictedScore: z.number().int().min(0).max(100).optional(),
});



async function refreshMetrics(row: Awaited<ReturnType<typeof listWatchedVideos>>[0]) {
  const stats = await fetchVideoStatsById(row.youtubeId);
  if (!stats) {
    return {
      ...row,
      refreshError: true,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      metricsUpdatedAt: row.metricsUpdatedAt,
      performanceScore: null,
    } as const;
  }
  const views = stats.viewCount ?? row.views;
  const likes = stats.likeCount ?? row.likes;
  const comments = stats.commentCount ?? row.comments;
  // Score de desempenho normalizado: proporção de engagement-rate e growth vs. previsto
  const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;
  // Referências fixas para o nicho YouTube: 2% de engagement é bom; 100k views é forte
  const engagementScore = Math.min(100, Math.round(engagementRate * 25)); // 4% → 100
  const viewsScore = Math.min(100, Math.round(Math.log10(Math.max(views, 1)) * (100 / 5))); // 100k → 100
  const performanceScore = Math.round(engagementScore * 0.45 + viewsScore * 0.55);
  return {
    ...row,
    refreshError: false,
    views,
    likes,
    comments,
    metricsUpdatedAt: new Date(),
    performanceScore,
  } as const;
}

export const watchedRouter = router({
  /** Lista os vídeos monitorados do usuário, já com métricas atualizadas. */
  list: protectedProcedure.mutation(async ({ ctx }) => {
    const rows = await listWatchedVideos(ctx.user.id);
    const refreshed = await Promise.all(rows.map((r) => refreshMetrics(r)));
    // persiste as métricas atualizadas
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      await Promise.all(
        refreshed.map((r) =>
          db
            .update(watchedVideos)
            .set({ views: r.views, likes: r.likes, comments: r.comments, metricsUpdatedAt: r.metricsUpdatedAt })
            .where(eq(watchedVideos.id, r.id))
        )
      );
    }
    return refreshed;
  }),

  /** Adiciona um vídeo publicado para monitoramento. */
  add: protectedProcedure.input(addInput).mutation(async ({ ctx, input }) => {
    const youtubeId = input.youtubeId;
    const rows = await addWatchedVideo({
      userId: ctx.user.id,
      youtubeId,
      title: input.title,
      suggestionTitle: input.suggestionTitle ?? null,
      predictedScore: input.predictedScore ?? null,
      videoUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      publishedAt: new Date(),
    });
    return rows;
  }),

  /** Remove um vídeo do monitoramento. */
  remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await removeWatchedVideo(ctx.user.id, input.id);
    return { success: true } as const;
  }),
});
