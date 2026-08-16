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

/**
 * (Rodada 33) Teste de conexão real com os providers configurados.
 * Permite ao usuário validar a chave e o endpoint ANTES de salvar a
 * configuração no perfil.
 */

export type ConnectionTestResult = {
  /** "ok" | "invalid_key" | "timeout" | "unreachable" | "error" */
  status: "ok" | "invalid_key" | "timeout" | "unreachable" | "error";
  /** Mensagem legível em pt-BR */
  message: string;
  /** Latência da requisição de teste em ms */
  latencyMs: number | null;
};

const TEST_TIMEOUT_MS = 15_000;

/**
 * Teste de smoke do endpoint de LLM: uma requisição chat completions mínima
 * (max_tokens 5) para validar chave, base e modelo. Não gera resposta útil —
 * apenas confirma que o endpoint responde com sucesso.
 */
export async function testLlmConnection(config: {
  apiUrl: string;
  apiKey: string | undefined;
  model: string | undefined;
}): Promise<ConnectionTestResult> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model ?? "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return { status: "ok", message: "Conexão bem-sucedida — o endpoint respondeu normalmente.", latencyMs };
      }
      if (response.status === 401 || response.status === 403) {
        const detail = await response.text().catch(() => "");
        return {
          status: "invalid_key",
          message: `A chave foi recusada (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}. Verifique a chave da API.`,
          latencyMs,
        };
      }
      if (response.status === 404) {
        return {
          status: "error",
          message: `Endpoint não encontrado (HTTP 404) — verifique a URL base (deve terminar em /v1).`,
          latencyMs,
        };
      }
      return {
        status: "error",
        message: `O endpoint respondeu com HTTP ${response.status} (${response.statusText}).`,
        latencyMs,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof Error && /aborted|abort/i.test(err.name) === false && /timeout/i.test(err.message)) {
      return {
        status: "timeout",
        message: "A requisição expirou antes de obter uma resposta — verifique a URL e sua conexão.",
        latencyMs,
      };
    }
    if (err instanceof Error && (/aborted/i.test(err.name) || /aborted|timeout|ECONNREFUSED|ENOTFOUND/i.test(err.message))) {
      return {
        status: "timeout",
        message: "A requisição expirou antes de obter uma resposta — verifique a URL e sua conexão.",
        latencyMs,
      };
    }
    return {
      status: "unreachable",
      message: `Não foi possível alcançar o endpoint${err instanceof Error ? `: ${err.message.slice(0, 200)}` : ""}.`,
      latencyMs,
    };
  }
}

/**
 * Teste da chave do YouTube Data API: busca uma consulta mínima de vídeos
 * (1 resultado) contra o endpoint direto do Google.
 */
export async function testYoutubeConnection(): Promise<ConnectionTestResult> {
  const started = Date.now();
  if (!ENV.youtubeApiKey || ENV.youtubeApiKey.trim().length === 0) {
    return {
      status: "invalid_key",
      message: "Nenhuma chave YOUTUBE_DATA_API_KEY configurada no servidor.",
      latencyMs: null,
    };
  }
  try {
    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("q", "test");
    url.searchParams.set("maxResults", "1");
    url.searchParams.set("key", ENV.youtubeApiKey);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (response.ok) {
        return { status: "ok", message: "Conexão com o YouTube bem-sucedida — a chave é válida.", latencyMs };
      }
      if (response.status === 403 || response.status === 400) {
        const detail = await response.text().catch(() => "");
        return {
          status: "invalid_key",
          message: `A chave foi recusada ou o limite foi atingido (HTTP ${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
          latencyMs,
        };
      }
      return {
        status: "error",
        message: `O YouTube respondeu com HTTP ${response.status} (${response.statusText}).`,
        latencyMs,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return {
      status: "unreachable",
      message: "Não foi possível alcançar o YouTube Data API. Verifique a conexão do servidor.",
      latencyMs: Date.now() - started,
    };
  }
}
