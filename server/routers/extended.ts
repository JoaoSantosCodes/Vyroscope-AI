import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AnalysisResult } from "../analysis";
import { analyzeNicheComparison, buildThumbnailPrompt, generateAlternativeTitles, generateContentAgenda, generateExtendedScript } from "../extended";
import { fetchTrendingVideosForNiche } from "../youtube";
import { protectedProcedure, router } from "../_core/trpc";

function parseResult(raw: string | null): AnalysisResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnalysisResult;
  } catch {
    return null;
  }
}

const scriptInput = z.object({
  analysisId: z.string().min(1),
  suggestionIndex: z.number().int().min(0).max(10),
});

const comparisonInput = z.object({
  nicheA: z.string().min(2).max(100),
  nicheB: z.string().min(2).max(100),
});

const agendaInput = z.object({
  analysisId: z.string().min(1),
});

export const extendedRouter = router({
  /** Gera roteiro estendido a partir de uma sugestão de uma análise do usuário. */
  generateScript: protectedProcedure.input(scriptInput).mutation(async ({ ctx, input }) => {
    const { getAnalysisById } = await import("../db");
    const analysis = await getAnalysisById(input.analysisId);
    if (!analysis) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada." });
    }
    if (analysis.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Esta análise não pertence a você." });
    }
    const result = parseResult(analysis.result);
    if (!result) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Esta análise ainda não foi concluída." });
    }
    const suggestion = result.suggestions?.[input.suggestionIndex];
    if (!suggestion) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sugestão não encontrada." });
    }
    const script = await generateExtendedScript(analysis.niche, suggestion, result.patterns ?? []);
    return script;
  }),

  /** Compara dois nichos em tempo real usando vídeos em alta de cada um. */
  compare: protectedProcedure.input(comparisonInput).mutation(async ({ input }) => {
    const [videosA, videosB] = await Promise.all([
      fetchTrendingVideosForNiche(input.nicheA.trim(), 10).catch(() => [] as never[]),
      fetchTrendingVideosForNiche(input.nicheB.trim(), 10).catch(() => [] as never[]),
    ]);
    if (!videosA.length || !videosB.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível coletar vídeos suficientes em um dos nichos. Tente outros termos." });
    }
    const comparison = await analyzeNicheComparison(input.nicheA.trim(), videosA, input.nicheB.trim(), videosB);
    // enriquece com top video e engajamento agregado dos dados reais
    const enriched = comparison.niches.map((n, idx) => {
      const videos = idx === 0 ? videosA : videosB;
      const top = videos.reduce(
        (best, v) => ((v.viewCount ?? 0) > (best.viewCount ?? -1) ? v : best),
        videos[0]
      );
      let rateSum = 0;
      let rateCount = 0;
      for (const v of videos) {
        if (v.viewCount && v.viewCount > 0) {
          rateSum += (((v.likeCount ?? 0) + (v.commentCount ?? 0)) / v.viewCount) * 100;
          rateCount += 1;
        }
      }
      return {
        ...n,
        topVideo: top
          ? { title: top.title, viewCount: top.viewCount, likeCount: top.likeCount, channelTitle: top.channelTitle }
          : null,
        avgEngagementRate: rateCount > 0 ? Math.round((rateSum / rateCount) * 100) / 100 : null,
        totalViews: videos.reduce((s, v) => s + (v.viewCount ?? 0), 0),
        avgViews: Math.round(videos.reduce((s, v) => s + (v.viewCount ?? 0), 0) / Math.max(videos.length, 1)),
      };
    });
    comparison.niches = enriched;
    return comparison;
  }),

  /** Gera uma thumbnail sugerida por IA para uma sugestão de uma análise. */
  generateThumbnail: protectedProcedure
    .input(z.object({ analysisId: z.string().min(1), suggestionIndex: z.number().int().min(0).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const { getAnalysisById, saveSuggestionThumbnail } = await import("../db");
      const analysis = await getAnalysisById(input.analysisId);
      if (!analysis) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada." });
      }
      if (analysis.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Esta análise não pertence a você." });
      }
      const result = parseResult(analysis.result);
      if (!result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta análise ainda não foi concluída." });
      }
      const suggestion = result.suggestions?.[input.suggestionIndex];
      if (!suggestion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sugestão não encontrada." });
      }
      const { generateImage } = await import("../_core/imageGeneration");
      const prompt = buildThumbnailPrompt(analysis.niche, suggestion.title, result.patterns ?? []);
      let imageUrl: string;
      try {
        const generated = await generateImage({ prompt });
        imageUrl = generated.url ?? "";
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar a imagem. Tente novamente." });
      }
      if (!imageUrl) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A geração da imagem retornou vazia. Tente novamente." });
      }
      await saveSuggestionThumbnail({
        analysisId: analysis.id,
        suggestionTitle: suggestion.title,
        imageUrl,
        prompt,
      });
      return { imageUrl, prompt, suggestionTitle: suggestion.title } as const;
    }),

  /** Gera 5 títulos alternativos com score de viralidade para uma sugestão. */
  generateAlternativeTitles: protectedProcedure.input(scriptInput).mutation(async ({ ctx, input }) => {
    const { getAnalysisById } = await import("../db");
    const analysis = await getAnalysisById(input.analysisId);
    if (!analysis) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada." });
    }
    if (analysis.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Esta análise não pertence a você." });
    }
    const result = parseResult(analysis.result);
    if (!result) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Esta análise ainda não foi concluída." });
    }
    const suggestion = result.suggestions?.[input.suggestionIndex];
    if (!suggestion) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sugestão não encontrada." });
    }
    return generateAlternativeTitles(analysis.niche, suggestion, result.patterns ?? []);
  }),

  /** Marca/desmarca uma thumbnail como favorita (galeria). */
  toggleFavorite: protectedProcedure
    .input(z.object({ thumbnailId: z.number().int().positive(), favorite: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { setThumbnailFavorite } = await import("../db");
      try {
        await setThumbnailFavorite(ctx.user.id, input.thumbnailId, input.favorite);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Erro ao favoritar" });
      }
      return { success: true } as const;
    }),

  /** Lista as thumbnails favoritas do usuário (galeria de favoritos). */
  listFavorites: protectedProcedure.query(async ({ ctx }) => {
    const { listFavoriteThumbnails } = await import("../db");
    return listFavoriteThumbnails(ctx.user.id);
  }),

  /** Gera agenda de conteúdo de 4 semanas a partir das sugestões de uma análise. */
  generateAgenda: protectedProcedure.input(agendaInput).mutation(async ({ ctx, input }) => {
    const { getAnalysisById } = await import("../db");
    const analysis = await getAnalysisById(input.analysisId);
    if (!analysis) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada." });
    }
    if (analysis.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Esta análise não pertence a você." });
    }
    const result = parseResult(analysis.result);
    if (!result) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Esta análise ainda não foi concluída." });
    }
    return generateContentAgenda(analysis.niche, result.suggestions ?? []);
  }),
});
