import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  confirmLimitOverride,
  getBlockedAttempts,
  getLimitStatus,
  getUserLimits,
  listUnreadUsageAlerts,
  markUsageAlertRead,
  purgeReadUsageAlerts,
  getUsageBudgets,
  getUsageDailySeries,
  getUsageSummary,
  getUserStats,
  projectExhaustion,
  estimateMonthlyCostBrl,
  getFxRateHistory as getFxRateHistoryDb,
  LLM_MODEL_PRICES,
  LLM_DEFAULT_PRICE_PER_MILLION,
  setProviderSettings,
  setUserLimits,
  updateLocalCode,
  updateUserProfile,
} from "../db";
import {
  resolveImageConfig,
  resolveLlmConfig,
  resolveYoutubeConfig,
  testLlmConnection,
  testYoutubeConnection,
  validateApiBase,
} from "../providers";
import { hashSecretCode } from "../_core/authProvider";
import { protectedProcedure, router } from "../_core/trpc";

export const profileRouter = router({
  /** Dados da conta do usuário autenticado + estatísticas de uso. */
  me: protectedProcedure.query(async ({ ctx }) => {
    const stats = await getUserStats(ctx.user.id);
    return {
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      loginMethod: ctx.user.loginMethod,
      role: ctx.user.role,
      createdAt: ctx.user.createdAt.getTime(),
      lastSignedIn: ctx.user.lastSignedIn.getTime(),
      stats,
    };
  }),

  /** Atualiza nome/email do perfil (o openId não pode ser alterado). */
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "O nome não pode ficar vazio").max(100).optional(),
        email: z.string().email("E-mail inválido").max(320).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const updated = await updateUserProfile(ctx.user.id, input);
        if (!updated) throw new Error("user_not_found");
        return {
          id: updated.id,
          name: updated.name,
          email: updated.email,
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível atualizar o perfil." });
      }
    }),

  /**
   * (Rodada 31) Define, atualiza ou remove o código secreto pessoal do
   * usuário para o login local. O código é persistido apenas como hash
   * SHA-256 (users.localCodeHash); o código em si nunca é armazenado.
   * `code` vazio/remove=true remove o código pessoal (volta ao global).
   */
  setSecretCode: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().min(0).max(120),
        confirm: z.string().trim(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.code !== input.confirm) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Os códigos não coincidem.",
        });
      }
      try {
        if (input.code.length === 0) {
          await updateLocalCode(ctx.user.id, null);
          return { hasPersonalCode: false };
        }
        await updateLocalCode(ctx.user.id, hashSecretCode(input.code));
        return { hasPersonalCode: true };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível salvar o código de acesso.",
        });
      }
    }),

  /**
   * (Rodada 32) Status das APIs configuradas: quais providers de LLM, imagem
   * e YouTube estão ativos e qual provedor está em uso (envs do servidor +
   * overrides por usuário de user_settings).
   */
  apiProviderStatus: protectedProcedure.query(async ({ ctx }) => {
    const [llm, image, youtube] = await Promise.all([
      resolveLlmConfig(ctx.user.id),
      resolveImageConfig(ctx.user.id),
      Promise.resolve(resolveYoutubeConfig()),
    ]);
    return { llm, image, youtube };
  }),

  /**
   * (Rodada 32) Configura provedores alternativos por usuário (Groq,
   * OpenRouter, endpoints custom). Chaves e bases vazias removem o override
   * (volta ao padrão do servidor/env). URLs devem ser https.
   */
  setProviderSettings: protectedProcedure
    .input(
      z.object({
        llmApiBase: z.string().trim().max(500).optional(),
        llmApiKey: z.string().trim().max(2000).optional(),
        llmModel: z.string().trim().max(120).optional(),
        imageApiKey: z.string().trim().max(2000).optional(),
        imageModel: z.string().trim().max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Se o usuário informou chave (LLM ou imagem) sem base custom, assume
      // o OpenAI como base padrão; caso contrário valida a URL informada.
      const requiresBase =
        Boolean(input.llmApiKey) || Boolean(input.imageApiKey);
      const llmBase = input.llmApiBase ?? (requiresBase ? "https://api.openai.com/v1" : undefined);
      if (llmBase) {
        const baseError = validateApiBase(llmBase);
        if (baseError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: baseError });
        }
      }
      try {
        await setProviderSettings(ctx.user.id, {
          ...input,
          llmApiBase: llmBase,
        });
        return { ok: true };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível salvar as configurações.",
        });
      }
    }),

  /**
   * (Rodada 33) Teste de conexão com os providers ANTES de salvar.
   * - `target = "llm"` (padrão): testa LLM. Se o usuário enviar uma chave
   *   personalizada no teste (sem salvar), ela é usada no lugar do override;
   * - `target = "youtube"`: testa a chave YOUTUBE_DATA_API_KEY do servidor.
   */
  testApiConnection: protectedProcedure
    .input(
      z.object({
        target: z.enum(["llm", "youtube"]).default("llm"),
        llmApiBase: z.string().trim().max(500).optional(),
        llmApiKey: z.string().trim().max(2000).optional(),
        llmModel: z.string().trim().max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.target === "youtube") {
        return testYoutubeConnection();
      }
      // Configuração em teste: usuário > override do banco > envs/forge
      let llmConfig;
      if (input.llmApiKey && input.llmApiBase) {
        const baseError = validateApiBase(input.llmApiBase);
        if (baseError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: baseError });
        }
        llmConfig = await Promise.resolve({
          apiUrl: `${input.llmApiBase.replace(/\/$/, "")}/chat/completions`,
          apiKey: input.llmApiKey,
          model: input.llmModel?.trim() || undefined,
          provider: "custom",
          active: true,
        });
      } else {
        llmConfig = await resolveLlmConfig(ctx.user.id);
      }
      return testLlmConnection(llmConfig);
    }),

  /**
   * (Rodada 34) Verificação em lote de todos os provedores configurados:
   * testa LLM (configuração em vigor) e YouTube em paralelo, retornando
   * o resultado de cada um mais um status geral consolidado.
   */
  testAllConnections: protectedProcedure.mutation(async ({ ctx }) => {
    const [llmConfig, llm, youtubeTest] = await Promise.all([
      resolveLlmConfig(ctx.user.id),
      resolveLlmConfig(ctx.user.id).then((cfg) => testLlmConnection(cfg)),
      testYoutubeConnection(),
    ]);
    const youtube = resolveYoutubeConfig();
    const ok = llm.status === "ok" && youtubeTest.status === "ok";
    const allConfigured = llmConfig.active && youtube.keyConfigured;
    return {
      ok,
      allConfigured,
      llm,
      youtube: youtubeTest,
      youtubeConfigured: youtube.keyConfigured,
      summary: allConfigured
        ? ok
          ? "Todos os provedores verificados com sucesso."
          : "Um ou mais provedores falharam na verificação."
        : "Existem provedores sem configuração — a análise usará o provedor interno (Manus) como fallback.",
    };
  }),

  /**
   * (Rodada 35) Resumo de consumo das APIs do usuário:
   * tokens LLM e unidades da cota YouTube por período (hoje/semana/mês).
   */
  getUsageSummary: protectedProcedure.query(async ({ ctx }) => {
    const usage = await getUsageSummary(ctx.user.id);
    return usage;
  }),

  /**
   * (Rodada 36) Série de consumo diário (últimos N dias) por escopo,
   * para os gráficos da página de uso, incluindo os limites por dia.
   */
  getUsageDailySeries: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(30) }).default({ days: 30 }))
    .query(async ({ ctx, input }) => {
      const series = await getUsageDailySeries(ctx.user.id, input.days);
      return series;
    }),
  /**
   * (Rodada 41) Série diária da cotação USD/BRL (últimos N dias), alimentada
   * automaticamente a cada consulta de câmbio (AwesomeAPI ou fallback).
   */
  getFxRateHistory: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(30) }).default({ days: 30 }))
    .query(async ({ ctx, input }) => {
      return getFxRateHistoryDb(input.days);
    }),

  /**
   * (Rodada 36) Limites diários atuais do usuário e estado de alerta:
   * "ok" / "warn" (>=80%) / "blocked" (>=100%) por escopo (análises/tokens/quota).
   */
  getLimits: protectedProcedure.query(async ({ ctx }) => {
    const [status, limits, budgets] = await Promise.all([
      getLimitStatus(ctx.user.id),
      getUserLimits(ctx.user.id),
      getUsageBudgets(ctx.user.id),
    ]);
    const todayIso = new Date().toISOString().slice(0, 10);
    return {
      ...status,
      /** (Rodada 37) */
      limitAction: limits.limitAction,
      weeklyTokenLimit: limits.weeklyTokenLimit,
      weeklyQuotaLimit: limits.weeklyQuotaLimit,
      monthlyTokenLimit: limits.monthlyTokenLimit,
      monthlyQuotaLimit: limits.monthlyQuotaLimit,
      /** (Rodada 40) Teto de custo mensal em R$ (0 = sem teto). */
      monthlyCostCapBrl: limits.monthlyCostCapBrl,
      /** (Rodada 41) Ação do teto de custo: "block" = bloqueia automaticamente;
       * "warn" = pede confirmação; "alert" = apenas notifica. */
      costCapAction: limits.costCapAction,
      overrideUntil: limits.overrideUntil,
      /** (Rodada 38) Análises restantes autorizadas por confirmação de uso único */
      overrideRemaining: limits.overrideRemaining ?? 0,
      budgets: {
        week: {
          ...budgets.week,
          tokenLimit: limits.weeklyTokenLimit,
          quotaLimit: limits.weeklyQuotaLimit,
          tokenProjection: projectExhaustion({ consumed: budgets.week.tokens, cap: limits.weeklyTokenLimit, windowStartIso: budgets.weekStartIso, todayIso }),
          quotaProjection: projectExhaustion({ consumed: budgets.week.quota, cap: limits.weeklyQuotaLimit, windowStartIso: budgets.weekStartIso, todayIso }),
        },
        month: {
          ...budgets.month,
          tokenLimit: limits.monthlyTokenLimit,
          quotaLimit: limits.monthlyQuotaLimit,
          tokenProjection: projectExhaustion({ consumed: budgets.month.tokens, cap: limits.monthlyTokenLimit, windowStartIso: budgets.monthStartIso, todayIso }),
          quotaProjection: projectExhaustion({ consumed: budgets.month.quota, cap: limits.monthlyQuotaLimit, windowStartIso: budgets.monthStartIso, todayIso }),
        },
      },
    };
  }),

  /**
   * (Rodada 36) Define os limites diários opcionais do usuário (proteção de
   * custos). Valores 0 ou vazios = ilimitado. Máximos defensivos para evitar
   * inputs absurdos: 50 análises/dia, 500.000 tokens/dia, 1.000.000 unidades/dia.
   */
  setLimits: protectedProcedure
    .input(
      z.object({
        dailyAnalysisLimit: z.number().int().min(0).max(50).optional(),
        dailyTokenLimit: z.number().int().min(0).max(500_000).optional(),
        dailyQuotaLimit: z.number().int().min(0).max(1_000_000).optional(),
        /** (Rodada 37) "block" = bloqueia em 100%; "warn" = pede confirmação (apenas-avisar) */
        limitAction: z.enum(["block", "warn"]).optional(),
        weeklyTokenLimit: z.number().int().min(0).max(5_000_000).optional(),
        weeklyQuotaLimit: z.number().int().min(0).max(5_000_000).optional(),
        monthlyTokenLimit: z.number().int().min(0).max(5_000_000).optional(),
        monthlyQuotaLimit: z.number().int().min(0).max(5_000_000).optional(),
        /** (Rodada 40) Teto de custo mensal em R$ (0 = sem teto). */
        monthlyCostCapBrl: z.number().int().min(0).max(10_000).optional(),
        /** (Rodada 41) Ação do teto de custo: "block" = bloqueia automaticamente;
         * "warn" = pede confirmação; "alert" = apenas notifica. */
        costCapAction: z.enum(["block", "warn", "alert"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setUserLimits(ctx.user.id, {
        dailyAnalysisLimit: input.dailyAnalysisLimit ?? 0,
        dailyTokenLimit: input.dailyTokenLimit ?? 0,
        dailyQuotaLimit: input.dailyQuotaLimit ?? 0,
        limitAction: input.limitAction ?? "block",
        weeklyTokenLimit: input.weeklyTokenLimit ?? 0,
        weeklyQuotaLimit: input.weeklyQuotaLimit ?? 0,
        monthlyTokenLimit: input.monthlyTokenLimit ?? 0,
        monthlyQuotaLimit: input.monthlyQuotaLimit ?? 0,
        monthlyCostCapBrl: input.monthlyCostCapBrl ?? 0,
        costCapAction: input.costCapAction ?? "warn",
      });
      return { ok: true } as const;
    }),
  /**
   * (Rodada 39) Projeção de custo do consumo mensal em R$ pelo modelo LLM
   * configurado (override do usuário > env > padrão), com projeção pro-rata
   * do mês completo pelo ritmo diário corrente.
   */
  getUsageCost: protectedProcedure.query(async ({ ctx }) => {
    const cost = await estimateMonthlyCostBrl(ctx.user.id);
    return {
      ...cost,
      catalog: LLM_MODEL_PRICES,
      fallbackPrice: LLM_DEFAULT_PRICE_PER_MILLION,
    };
  }),
  /**
   * (Rodada 37/38) Confirmação manual de limite no modo "apenas avisar":
   * libera o bloqueio APENAS para a próxima análise (uso único) e mantém a
   * suspensão até a meia-noite como fallback. Retorna o overrideRemaining
   * atual (número de análises ainda autorizadas).
   */
  confirmLimitOverride: protectedProcedure.mutation(async ({ ctx }) => {
    const { overrideUntil, overrideRemaining } = await confirmLimitOverride(ctx.user.id);
    return { overrideUntil, overrideRemaining } as const;
  }),
  /**
   * (Rodada 38) Alertas proativos de uso não lidos (80% / 100% de limite),
   * com higiene automática dos lidos antigos (>14 dias).
   */
  listUsageAlerts: protectedProcedure.query(async ({ ctx }) => {
    await purgeReadUsageAlerts(ctx.user.id).catch(() => undefined);
    return listUnreadUsageAlerts(ctx.user.id);
  }),
  /** (Rodada 38) Marca um alerta de uso como lido. */
  markAlertRead: protectedProcedure
    .input(z.object({ alertId: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await markUsageAlertRead(input.alertId);
      return { ok: true } as const;
    }),
  /**
   * (Rodada 37) Histórico detalhado de tentativas bloqueadas pelos limites.
   */
  listBlockedAttempts: protectedProcedure.query(async ({ ctx }) => {
    return getBlockedAttempts(ctx.user.id);
  }),
});
