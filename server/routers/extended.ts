import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AnalysisResult } from "../analysis";
import { analyzeNicheComparison, buildThumbnailPrompt, generateAlternativeTitles, generateContentAgenda, generateExtendedScript, generateOutline } from "../extended";
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

  /** Lista as pastas de favoritos do usuário. */
  listFolders: protectedProcedure.query(async ({ ctx }) => {
    const { listThumbnailFolders } = await import("../db");
    return listThumbnailFolders(ctx.user.id);
  }),

  /** Cria uma pasta na galeria de favoritos. */
  createFolder: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120), color: z.string().trim().max(16).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { createThumbnailFolder } = await import("../db");
      return createThumbnailFolder(ctx.user.id, input.name, input.color);
    }),

  /** Renomeia ou muda a cor de uma pasta. */
  updateFolder: protectedProcedure
    .input(z.object({ folderId: z.number().int().positive(), name: z.string().trim().min(1).max(120).optional(), color: z.string().trim().max(16).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { updateThumbnailFolder } = await import("../db");
      try {
        return await updateThumbnailFolder(ctx.user.id, input.folderId, { name: input.name, color: input.color });
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Erro ao atualizar pasta" });
      }
    }),

  /** Exclui uma pasta (thumbnails voltam para a raiz da galeria). */
  deleteFolder: protectedProcedure
    .input(z.object({ folderId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { deleteThumbnailFolder } = await import("../db");
      try {
        return await deleteThumbnailFolder(ctx.user.id, input.folderId);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Erro ao excluir pasta" });
      }
    }),

  /** Move uma thumbnail para uma pasta (folderId null = volta para a raiz). */
  moveThumbnail: protectedProcedure
    .input(z.object({ thumbnailId: z.number().int().positive(), folderId: z.number().int().positive().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { moveThumbnailToFolder } = await import("../db");
      try {
        return await moveThumbnailToFolder(ctx.user.id, input.thumbnailId, input.folderId);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Erro ao mover thumbnail" });
      }
    }),

  /** Reordena manualmente as thumbnails favoritas dentro da mesma pasta (ou da raiz quando folderId é null).
   *  orderedIds define a sequência de exibição (1, 2, 3, ...); IDs omitidos voltam à posição padrão. */
  reorderThumbnails: protectedProcedure
    .input(z.object({ folderId: z.number().int().positive().nullable(), orderedIds: z.array(z.number().int().positive()).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { reorderThumbnails } = await import("../db");
      try {
        return await reorderThumbnails(ctx.user.id, input.folderId, input.orderedIds);
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "Erro ao reordenar thumbnails" });
      }
    }),

  /** Painel "Ideia do dia": escolhe automaticamente uma sugestão do dia com base no nicho principal do usuário.
   *  Nicho principal = o nicho mais analisado; se empatado, o mais recente. A sugestão do dia
   *  é selecionada de forma determinística pela data atual, rotacionando entre as análises concluídas. */
  ideaOfTheDay: protectedProcedure.query(async ({ ctx }) => {
    const { listAnalysesByUser } = await import("../db");
    const analyses = await listAnalysesByUser(ctx.user.id);
    const completed = analyses.filter((a) => a.status === "completed" && a.result);
    if (completed.length === 0) return { idea: null, reason: "no_completed_analyses" as const };
    // Nicho principal: maior número de análises concluídas; empate → mais recente
    const byNiche = new Map<string, typeof completed>();
    for (const a of completed) {
      const list = byNiche.get(a.niche) ?? [];
      list.push(a);
      byNiche.set(a.niche, list);
    }
    const primaryNiche = Array.from(byNiche.entries()).sort(
      (a, b) => b[1].length - a[1].length || new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime()
    )[0][0];
    const nicheAnalyses = byNiche.get(primaryNiche)!.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // Rotação determinística pela data atual
    const today = new Date().toISOString().slice(0, 10);
    const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const suggestionIdx = dayIndex % nicheAnalyses.length;
    const analysis = nicheAnalyses[suggestionIdx];
    const result = parseResult(analysis.result);
    if (!result || !result.suggestions?.length) return { idea: null, reason: "no_suggestions" as const };
    const topSuggestions = [...result.suggestions].sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));
    const suggestion = topSuggestions[dayIndex % topSuggestions.length];
    return {
      idea: {
        niche: primaryNiche,
        analysisId: analysis.id,
        analysisDate: new Date(analysis.createdAt).getTime(),
        suggestion,
        date: today,
      },
      reason: null,
    } as const;
  }),

  /** Gera um esboço de roteiro automático a partir da sugestão da ideia do dia do usuário. */
  generateIdeaOutline: protectedProcedure.mutation(async ({ ctx }) => {
    const { listAnalysesByUser } = await import("../db");
    const analyses = await listAnalysesByUser(ctx.user.id);
    const completed = analyses.filter((a) => a.status === "completed" && a.result);
    if (completed.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Você ainda não concluiu nenhuma análise para gerar um esboço." });
    }
    const byNiche = new Map<string, typeof completed>();
    for (const a of completed) {
      const list = byNiche.get(a.niche) ?? [];
      list.push(a);
      byNiche.set(a.niche, list);
    }
    const primaryNiche = Array.from(byNiche.entries()).sort(
      (a, b) => b[1].length - a[1].length || new Date(b[1][0].createdAt).getTime() - new Date(a[1][0].createdAt).getTime()
    )[0][0];
    const nicheAnalyses = byNiche.get(primaryNiche)!.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const analysis = nicheAnalyses[dayIndex % nicheAnalyses.length];
    const result = parseResult(analysis.result);
    if (!result || !result.suggestions?.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não há sugestões disponíveis na análise escolhida." });
    }
    const topSuggestions = [...result.suggestions].sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));
    const suggestion = topSuggestions[dayIndex % topSuggestions.length];
    const outline = await generateOutline(primaryNiche, suggestion, result.patterns ?? []);
    return { niche: primaryNiche, analysisId: analysis.id, suggestion, outline };
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
