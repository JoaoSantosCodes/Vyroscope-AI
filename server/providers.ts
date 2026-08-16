/**
 * (Rodada 32) Resolução de providers com suporte a configuração por usuário.
 *
 * Camada única que decide de onde vem cada API (LLM e imagem), mesclando:
 *   1. Configuração do usuário (tabela user_settings: Groq, OpenRouter, custom…)
 *   2. Variáveis de ambiente do servidor (OPENAI_API_KEY/BASE/MODEL, IMAGE_MODEL)
 *   3. Fallback para o Forge interno da Manus quando nada estiver definido
 *
 * O YouTube continua env-only (a chave pertence ao projeto, não ao usuário).
 */
import { ENV } from "./_core/env";
import { getProviderSettings } from "./db";

const stripTrailingSlash = (base: string) =>
  base.endsWith("/") ? base.slice(0, -1) : base;

/**
 * Resolve a configuração do provider de LLM (Chat Completions).
 * Ordem: usuário > env OPENAI_* > Forge interno.
 */
export type LlmConfig = {
  /** URL completa do endpoint /chat/completions */
  apiUrl: string;
  apiKey: string | undefined;
  model: string | undefined;
  /** Identificador legível do provider ativo ("openai" | "groq" | "openrouter" | "manus-forge" | "custom") */
  provider: string;
  active: boolean;
};

const classifyProvider = (baseUrl: string): string => {
  const lower = baseUrl.toLowerCase();
  if (lower.includes("groq.com")) return "groq";
  if (lower.includes("openrouter")) return "openrouter";
  if (lower.includes("forge.manus.im")) return "manus-forge";
  if (lower.includes("api.openai.com")) return "openai";
  return "custom";
};

export async function resolveLlmConfig(
  userId?: number | null
): Promise<LlmConfig> {
  const user = userId ? await getProviderSettings(userId) : undefined;

  const base =
    user?.llmApiBase ??
    (ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0
      ? stripTrailingSlash(ENV.openaiApiBase)
      : undefined);

  const key =
    user?.llmApiKey ??
    (ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0
      ? ENV.openaiApiKey
      : ENV.forgeApiKey);

  const model = user?.llmModel ?? ENV.openaiModel;

  if (base && key) {
    return {
      apiUrl: `${base}/chat/completions`,
      apiKey: key,
      model: model || undefined,
      provider: classifyProvider(base),
      active: true,
    };
  }

  // Fallback: Forge interno da Manus.
  const forgeUrl =
    ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
      ? ENV.forgeApiUrl.replace(/\/$/, "")
      : "https://forge.manus.im";
  return {
    apiUrl: `${forgeUrl}/v1/chat/completions`,
    apiKey: ENV.forgeApiKey,
    model: undefined,
    provider: "manus-forge",
    active: Boolean(ENV.forgeApiKey),
  };
}

/**
 * Resolve a configuração do provider de geração de imagem.
 * Ordem: usuário (image_api_key, image_model) > env > Forge interno.
 */
export type ImageConfig = {
  /** URL completa do endpoint /images/generations */
  apiUrl: string;
  apiKey: string | undefined;
  model: string;
  provider: string;
  active: boolean;
};

export async function resolveImageConfig(
  userId?: number | null
): Promise<ImageConfig> {
  const user = userId ? await getProviderSettings(userId) : undefined;

  const base =
    (user?.llmApiBase ??
      (ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0
        ? stripTrailingSlash(ENV.openaiApiBase)
        : undefined)) ??
    "https://api.openai.com";

  const key =
    user?.imageApiKey ??
    user?.llmApiKey ??
    (ENV.openaiApiKey && ENV.openaiApiKey.trim().length > 0
      ? ENV.openaiApiKey
      : ENV.forgeApiKey);

  const model =
    user?.imageModel ?? ENV.imageModel ?? (key === ENV.openaiApiKey ? "dall-e-3" : "dall-e-3");

  if (key) {
    return {
      apiUrl: `${stripTrailingSlash(base)}/images/generations`,
      apiKey: key,
      model,
      provider: key === ENV.openaiApiKey ? classifyProvider(ENV.openaiApiBase) : "custom",
      active: true,
    };
  }

  const forgeUrl =
    ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
      ? ENV.forgeApiUrl.replace(/\/$/, "")
      : "https://forge.manus.im";
  return {
    apiUrl: `${forgeUrl}/v1/images/generations`,
    apiKey: ENV.forgeApiKey,
    model,
    provider: "manus-forge",
    active: Boolean(ENV.forgeApiKey),
  };
}

/** Status da chave do YouTube: env-only (não há override por usuário). */
export type YoutubeConfig = {
  keyConfigured: boolean;
  provider: string;
};

export function resolveYoutubeConfig(): YoutubeConfig {
  return {
    keyConfigured: Boolean(ENV.youtubeApiKey && ENV.youtubeApiKey.trim().length > 0),
    provider:
      ENV.youtubeApiKey && ENV.youtubeApiKey.trim().length > 0
        ? "youtube-data-api-direct"
        : "manus-data-hub",
  };
}

/** Validação mínima de URL base de API (https, sem espaço). */
export function validateApiBase(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return "A URL da API deve usar https";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "URL inválida";
  }
}
