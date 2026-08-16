import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getUsageSummary, getUserStats, setProviderSettings, updateLocalCode, updateUserProfile } from "../db";
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
});
