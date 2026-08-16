import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AnalysisResult } from "../analysis";
import { analyzeNicheComparison, buildPinnedSuggestion, buildThumbnailPrompt, generateAlternativeTitles, generateContentAgenda, generateExtendedScript, generateOutline } from "../extended";
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

  /** Histórico do painel "Ideia do dia": lista as ideias já rotacionadas (uma por dia,
   *  retrocedendo `limit` dias) com base no nicho principal do usuário. Cada ideia
   *  traz a sugestão, score, hook e link para a análise de origem. */
  ideaHistory: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(90).default(30),
          /** Filtro por nicho (aceita qualquer nicho do usuário, não só o principal) */
          nicheFilter: z.string().min(1).optional(),
          /** Faixa de score de viralidade */
          scoreMin: z.number().int().min(0).max(100).optional(),
          scoreMax: z.number().int().min(0).max(100).optional(),
        })
        .partial()
        .default({})
    )
    .query(async ({ ctx, input }) => {
      const { listAnalysesByUser } = await import("../db");
      const analyses = await listAnalysesByUser(ctx.user.id);
      const completed = analyses.filter((a) => a.status === "completed" && a.result);
      if (completed.length === 0) return { ideas: [], reason: "no_completed_analyses" as const };
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

      const ideas: {
        date: string;
        niche: string;
        analysisId: string;
        analysisDate: number;
        suggestion: { title: string; hook?: string; angle?: string; targetLength?: string; viralityScore: number | null; reasoning?: string };
      }[] = [];
      const now = new Date();
      const limit = input.limit ?? 30;
      for (let i = 0; i < limit; i += 1) {
        const dayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - i * 24 * 60 * 60 * 1000;
        const dayIndex = Math.floor(dayMs / (24 * 60 * 60 * 1000));
        const dateStr = new Date(dayMs).toISOString().slice(0, 10);
        const analysis = nicheAnalyses[dayIndex % nicheAnalyses.length];
        const result = parseResult(analysis.result);
        if (!result || !result.suggestions?.length) continue;
        const topSuggestions = [...result.suggestions].sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));
        const suggestion = topSuggestions[dayIndex % topSuggestions.length];
        ideas.push({
          date: dateStr,
          niche: primaryNiche,
          analysisId: analysis.id,
          analysisDate: new Date(analysis.createdAt).getTime(),
          suggestion,
        });
      }
      let filtered = ideas;
      if (input.nicheFilter) {
        const targetNiche = input.nicheFilter;
        const targetAnalyses = byNiche.get(targetNiche);
        if (targetAnalyses && targetAnalyses.length > 0) {
          // Quando o nicho filtrado existe nas análises do usuário, regenerar a
          // rotação usando esse nicho como principal em vez de apenas descartar
          const ta = [...targetAnalyses].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          const mapped: typeof ideas = [];
          for (let i = 0; i < limit; i += 1) {
            const dayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - i * 24 * 60 * 60 * 1000;
            const dayIndex = Math.floor(dayMs / (24 * 60 * 60 * 1000));
            const dateStr = new Date(dayMs).toISOString().slice(0, 10);
            const analysis = ta[dayIndex % ta.length];
            const result = parseResult(analysis.result);
            if (!result || !result.suggestions?.length) continue;
            const topSuggestions = [...result.suggestions].sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));
            const suggestion = topSuggestions[dayIndex % topSuggestions.length];
            mapped.push({ date: dateStr, niche: targetNiche, analysisId: analysis.id, analysisDate: new Date(analysis.createdAt).getTime(), suggestion });
          }
          filtered = mapped;
        } else {
          filtered = [];
        }
      }
      if (typeof input.scoreMin === "number" || typeof input.scoreMax === "number") {
        const lo = input.scoreMin ?? 0;
        const hi = input.scoreMax ?? 100;
        filtered = filtered.filter((idea) => {
          const s = idea.suggestion.viralityScore ?? 0;
          return s >= lo && s <= hi;
        });
      }
      return { ideas: filtered, reason: null, filters: { niches: Array.from(byNiche.keys()) } } as const;
    }),
  /** Fixa uma ideia do histórico no topo do painel. */
  pinIdeaHistory: protectedProcedure
    .input(
      z.object({
        date: z.string().min(10).max(10),
        analysisId: z.string().min(1),
        suggestionTitle: z.string().min(1),
        niche: z.string().min(1),
        viralityScore: z.number().int().min(0).max(100).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { pinIdea } = await import("../db");
      await pinIdea(ctx.user.id, input);
      return { success: true } as const;
    }),
  /** Remove a fixação de uma ideia. */
  unpinIdeaHistory: protectedProcedure
    .input(z.object({ pinnedId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { unpinIdea } = await import("../db");
      await unpinIdea(ctx.user.id, input.pinnedId);
      return { success: true } as const;
    }),
  /** Lista as ideias fixadas pelo usuário, ordenadas por ordem manual. */
  listPinnedIdeas: protectedProcedure.query(async ({ ctx }) => {
    const { listPinnedIdeas: listPinned } = await import("../db");
    const pinned = await listPinned(ctx.user.id);
    return { ideas: pinned } as const;
  }),
  /** Atualiza as anotações pessoais de uma ideia fixada. */
  updatePinnedNote: protectedProcedure
    .input(
      z.object({
        pinnedId: z.number().int().positive(),
        notes: z.string().max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { updatePinnedNote: updateNote } = await import("../db");
      await updateNote(ctx.user.id, input.pinnedId, input.notes.trim());
      return { success: true } as const;
    }),
  /** Reordena as ideias fixadas (arrastar e soltar). */
  reorderPinnedIdeas: protectedProcedure
    .input(z.object({ orderedIds: z.array(z.number().int().positive()).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const { reorderPinnedIdeas: reorder } = await import("../db");
      return reorder(ctx.user.id, input.orderedIds);
    }),
  /** Transforma uma ideia fixada em uma sugestão completa pronta para gravação.
   *  Usa o título e as anotações da ideia como insumo para o LLM gerar
   *  hook, ângulo, estrutura narrativa, duração e score. */
  buildSuggestionFromPinned: protectedProcedure
    .input(z.object({ pinnedId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { listPinnedIdeas: listPinned } = await import("../db");
      const pinned = await listPinned(ctx.user.id);
      const item = pinned.find((p) => p.id === input.pinnedId);
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ideia fixada não encontrada." });
      }
      const suggestion = await buildPinnedSuggestion(item.niche, item.suggestionTitle, item.notes);
      return suggestion;
    }),
  /** Atualiza o status de produção de uma ideia fixada (planejada/gravando/publicada). */
  updateIdeaStatus: protectedProcedure
    .input(z.object({ pinnedId: z.number().int().positive(), status: z.enum(["planejada", "gravando", "publicada"]) }))
    .mutation(async ({ ctx, input }) => {
      const { updateIdeaStatus: updateStatus } = await import("../db");
      await updateStatus(ctx.user.id, input.pinnedId, input.status);
      return { success: true } as const;
    }),
  /** Arquiva uma ideia fixada (remove do quadro Kanban sem perder o histórico). */
  archiveIdea: protectedProcedure
    .input(z.object({ pinnedId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { archiveIdea: archive } = await import("../db");
      await archive(ctx.user.id, input.pinnedId);
      return { success: true } as const;
    }),
  /** Restaura uma ideia arquivada para o quadro Kanban. */
  unarchiveIdea: protectedProcedure
    .input(z.object({ pinnedId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { unarchiveIdea: unarchive } = await import("../db");
      await unarchive(ctx.user.id, input.pinnedId);
      return { success: true } as const;
    }),
  /** Arquiva em massa todas as ideias publicadas e não arquivadas do usuário.
   *  Retorna o número de ideias arquivadas. */
  archivePublishedIdeas: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { archivePublishedIdeas: archiveAll } = await import("../db");
      const count = await archiveAll(ctx.user.id);
      return { archived: count } as const;
    }),
  /** Estatísticas de produção do quadro Kanban para um mês (YYYY-MM;
   *  padrão: mês corrente): publicadas no mês, tempo médio de produção
   *  (dias entre a fixação e a publicação) e a meta configurada do mês. */
  pinnedProductionStats: protectedProcedure
    .input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { getPinnedProductionStats } = await import("../db");
      return getPinnedProductionStats(ctx.user.id, input?.monthKey);
    }),
  /** Define a meta de publicações de um mês (upsert; meta padrão usada
   *  quando não há registro). */
  setMonthlyGoal: protectedProcedure
    .input(
      z.object({
        monthKey: z.string().regex(/^\d{4}-\d{2}$/),
        goal: z.number().int().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { setPinnedMonthlyGoal } = await import("../db");
      await setPinnedMonthlyGoal(ctx.user.id, input.monthKey, input.goal);
      return { success: true } as const;
    }),
  /** Streak de meses consecutivos com a meta de publicações cumprida
   *  (retrocedendo do mês corrente, exclusive). Rodada 20. */
  pinnedGoalStreak: protectedProcedure.query(async ({ ctx }) => {
    const { getMonthlyGoalStreak } = await import("../db");
    return getMonthlyGoalStreak(ctx.user.id);
  }),
  /** Histórico mês a mês (12 meses, corrente inclusive) com publicadas, meta,
   *  média de dias e se a meta foi cumprida — alimenta a página de streaks e
   *  o mini-gráfico de barras. Rodada 21. */
  pinnedMonthlyHistory: protectedProcedure.query(async ({ ctx }) => {
    const { getMonthlyHistory } = await import("../db");
    return getMonthlyHistory(ctx.user.id, 12);
  }),
  /** Exporta um resumo mensal de produção em PDF curto (página única)
   *  com o resumo do mês selecionado, dia do mês e selo de streak. Rodada 20. */
  exportMonthlyPdf: protectedProcedure
    .input(z.object({ monthKey: z.string().regex(/^\d{4}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => {
      const { getPinnedProductionStats, getMonthlyGoalStreak, dayOfMonth } = await import("../db");
      const stats = await getPinnedProductionStats(ctx.user.id, input.monthKey);
      const { streak } = await getMonthlyGoalStreak(ctx.user.id);
      const { buildMonthlyPdf } = await import("../exportPdf");
      const buffer = await buildMonthlyPdf({
        monthKey: stats.monthKey,
        publishedThisMonth: stats.publishedThisMonth,
        avgProductionDays: stats.avgProductionDays,
        goal: stats.goal,
        streak,
        dayOfMonth: dayOfMonth(),
        userName: ctx.user.name,
      });
      const key = `exports/resumo-producao-${input.monthKey}-${Date.now()}-${ctx.user.id}.pdf`;
      const { storagePut } = await import("../storage");
      const { url } = await storagePut(key, buffer, "application/pdf");
      return { downloadUrl: url, fileName: `resumo-producao-${input.monthKey}.pdf` } as const;
    }),
  /** Remove definitivamente uma ideia (arquivada ou não) do histórico. */
  deletePinnedIdea: protectedProcedure
    .input(z.object({ pinnedId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { deletePinnedIdea: del } = await import("../db");
      await del(ctx.user.id, input.pinnedId);
      return { success: true } as const;
    }),
  /** Exporta o histórico de ideias do dia (fixadas + rotacionadas) em PDF.
   *  O PDF reflete a visão atual do usuário, incluindo os filtros aplicados
   *  na página (o frontend envia as listas filtradas). */
  exportIdeaHistoryPdf: protectedProcedure
    .input(
      z.object({
        /** Resumo opcional das estatísticas de produção do mês para o cabeçalho do PDF (rodada 19). */
        productionStats: z
          .object({
            monthKey: z.string().min(1).max(7),
            publishedThisMonth: z.number().int().min(0),
            avgProductionDays: z.number().nullable(),
            goal: z.number().int().min(1).max(100),
          })
          .optional(),
        pinned: z.array(
          z.object({
            date: z.string().min(1).max(10),
            niche: z.string().min(1),
            analysisId: z.string().min(1),
            title: z.string().min(1),
            hook: z.string().optional(),
            angle: z.string().optional(),
            viralityScore: z.number().int().min(0).max(100).nullable(),
            notes: z.string().optional(),
            status: z.enum(["planejada", "gravando", "publicada"]).optional(),
          })
        ).max(200),
        archived: z.array(
          z.object({
            date: z.string().min(1).max(10),
            niche: z.string().min(1),
            analysisId: z.string().min(1),
            title: z.string().min(1),
            hook: z.string().optional(),
            angle: z.string().optional(),
            viralityScore: z.number().int().min(0).max(100).nullable(),
            notes: z.string().optional(),
            status: z.enum(["planejada", "gravando", "publicada"]).optional(),
          })
        ).max(200).optional(),
        ideas: z.array(
          z.object({
            date: z.string().min(1).max(10),
            niche: z.string().min(1),
            analysisId: z.string().min(1),
            analysisDate: z.number().optional(),
            title: z.string().min(1),
            hook: z.string().optional(),
            angle: z.string().optional(),
            viralityScore: z.number().int().min(0).max(100).nullable(),
            notes: z.string().optional(),
          })
        ).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { buildIdeaHistoryPdf } = await import("../exportPdf");
      if (input.pinned.length === 0 && (input.archived?.length ?? 0) === 0 && input.ideas.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não há ideias para exportar." });
      }
      const buffer = await buildIdeaHistoryPdf({
        productionStats: input.productionStats,
        pinned: input.pinned,
        archived: input.archived,
        ideas: input.ideas,
        userName: ctx.user.name,
      });
      const key = `exports/ideia-do-dia-${Date.now()}-${ctx.user.id}.pdf`;
      const { storagePut } = await import("../storage");
      const { url } = await storagePut(key, buffer, "application/pdf");
      return {
        downloadUrl: url,
        fileName: "historico-ideias-vyroscope.pdf",
      } as const;
    }),
  /** Gera um esboço de roteiro automático a partir da sugestão da ideia do dia do usuário.
   *  Quando analysisId + suggestionTitle são informados, gera o esboço para essa sugestão
   *  específica (usado pelo histórico de ideias do dia); caso contrário, usa a ideia do dia. */
  generateIdeaOutline: protectedProcedure
    .input(
      z
        .object({
          analysisId: z.string().min(1).optional(),
          suggestionTitle: z.string().min(1).optional(),
        })
        .default({})
    )
    .mutation(async ({ ctx, input }) => {
      const { listAnalysesByUser, getAnalysisById } = await import("../db");
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

      let analysis;
      let suggestion;
      if (input.analysisId && input.suggestionTitle) {
        analysis = await getAnalysisById(input.analysisId);
        if (!analysis || analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Análise não encontrada." });
        }
        const result = parseResult(analysis.result);
        const found = result?.suggestions?.find((s) => s.title === input.suggestionTitle);
        if (!found) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Sugestão não encontrada na análise informada." });
        }
        suggestion = found;
      } else {
        const nicheAnalyses = byNiche.get(primaryNiche)!.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
        analysis = nicheAnalyses[dayIndex % nicheAnalyses.length];
        const result = parseResult(analysis.result);
        if (!result || !result.suggestions?.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Não há sugestões disponíveis na análise escolhida." });
        }
        const topSuggestions = [...result.suggestions].sort((a, b) => (b.viralityScore ?? 0) - (a.viralityScore ?? 0));
        suggestion = topSuggestions[dayIndex % topSuggestions.length];
      }
      const result = parseResult(analysis.result)!;
      const outline = await generateOutline(analysis.niche, suggestion, result.patterns ?? []);
      return { niche: analysis.niche, analysisId: analysis.id, suggestion, outline };
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
