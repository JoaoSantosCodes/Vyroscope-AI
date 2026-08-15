import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addWatchedVideo,
  listMetricsHistory,
  listWatchedVideos,
  recordWatchedMetrics,
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
        refreshed.map(async (r) => {
          await db
            .update(watchedVideos)
            .set({ views: r.views, likes: r.likes, comments: r.comments, metricsUpdatedAt: r.metricsUpdatedAt })
            .where(eq(watchedVideos.id, r.id));
          // Grava um ponto no histórico de evolução de métricas
          await recordWatchedMetrics({
            userId: ctx.user.id,
            watchedVideoId: r.id,
            views: r.views,
            likes: r.likes,
            comments: r.comments,
          }).catch(() => undefined);
        })
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

  /** Retorna a série histórica de views/likes/comments de um vídeo monitorado (para o gráfico).
   *  daily: médias diárias agregadas (quando há múltiplos pontos no mesmo dia).
   *  growth: crescimento percentual de views/likes vs. a semana anterior (7 dias atrás). */
  metrics: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await listWatchedVideos(ctx.user.id);
      const owned = rows.find((r) => r.id === input.id);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Vídeo monitorado não encontrado" });
      const history = await listMetricsHistory(ctx.user.id, input.id);
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const weekAgo = now - 7 * day;
      // Médias diárias: agrupa pontos do mesmo dia em uma média
      const dayBuckets = new Map<string, { views: number[]; likes: number[]; comments: number[] }>();
      for (const h of history) {
        const key = new Date(h.recordedAt).toISOString().slice(0, 10);
        const bucket = dayBuckets.get(key) ?? { views: [], likes: [], comments: [] };
        bucket.views.push(h.views);
        bucket.likes.push(h.likes);
        bucket.comments.push(h.comments);
        dayBuckets.set(key, bucket);
      }
      const daily = Array.from(dayBuckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, bucket]) => ({
          date,
          views: Math.round(bucket.views.reduce((s, v) => s + v, 0) / bucket.views.length),
          likes: Math.round(bucket.likes.reduce((s, v) => s + v, 0) / bucket.likes.length),
          comments: Math.round(bucket.comments.reduce((s, v) => s + v, 0) / bucket.comments.length),
        }));
      // Crescimento vs. semana anterior: média dos últimos 7 dias vs. média dos 7 dias anteriores
      const lastWeek = history.filter((h) => h.recordedAt.getTime() >= weekAgo - day);
      const prevWeek = history.filter((h) => h.recordedAt.getTime() < weekAgo - day && h.recordedAt.getTime() >= weekAgo - 8 * day);
      const avg = (arr: typeof history) => ({
        views: arr.length ? Math.round(arr.reduce((s, h) => s + h.views, 0) / arr.length) : 0,
        likes: arr.length ? Math.round(arr.reduce((s, h) => s + h.likes, 0) / arr.length) : 0,
      });
      const growthPercent = (prev: number, curr: number) => (prev === 0 ? (curr > 0 ? 100 : null) : Math.round(((curr - prev) / prev) * 100));
      const lw = avg(lastWeek);
      const pw = avg(prevWeek);
      return {
        youtubeId: owned.youtubeId,
        title: owned.title,
        history,
        daily,
        growth: {
          viewsPercent: growthPercent(pw.views, lw.views),
          likesPercent: growthPercent(pw.likes, lw.likes),
          lastWeekAvgViews: lw.views,
          lastWeekAvgLikes: lw.likes,
          prevWeekAvgViews: pw.views,
          prevWeekAvgLikes: pw.likes,
        },
      };
    }),
});
