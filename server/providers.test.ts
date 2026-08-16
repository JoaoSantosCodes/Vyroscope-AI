import { describe, expect, it, vi } from "vitest";

// vi.mock antes de qualquer import do módulo — padrão do projeto (authProvider.test.ts)
vi.mock("./db", () => ({
  getProviderSettings: vi.fn().mockReturnValue(undefined),
  updateProviderSettings: vi.fn().mockResolvedValue(true),
}));
vi.mock("./_core/env", () => ({
  ENV: {
    openaiApiKey: undefined,
    openaiApiBase: "https://api.openai.com/v1",
    openaiModel: undefined,
    imageModel: "dall-e-3",
    forgeApiKey: undefined,
    forgeApiUrl: undefined,
    youtubeApiKey: undefined,
  },
}));

import { getProviderSettings } from "./db";
import { ENV } from "./_core/env";
import {
  resolveImageConfig,
  resolveLlmConfig,
  resolveYoutubeConfig,
  validateApiBase,
} from "./providers";

const setEnv = (patch: Partial<typeof ENV>) => {
  Object.assign(ENV, patch);
};

const resetEnv = () => {
  setEnv({
    openaiApiKey: undefined,
    openaiApiBase: "https://api.openai.com/v1",
    openaiModel: undefined,
    imageModel: "dall-e-3",
    forgeApiKey: undefined,
    forgeApiUrl: undefined,
    youtubeApiKey: undefined,
  });
};

const mockUserSettings = vi.mocked(getProviderSettings);

describe("resolveLlmConfig", () => {
  it("usa o Forge interno quando nada está configurado", async () => {
    resetEnv();
    const cfg = await resolveLlmConfig();
    expect(cfg.provider).toBe("manus-forge");
    expect(cfg.active).toBe(false);
    expect(cfg.apiUrl).toContain("/chat/completions");
  });

  it("ativa o Forge quando a chave do hub está disponível", async () => {
    resetEnv();
    setEnv({ forgeApiKey: "forge-secret" });
    const cfg = await resolveLlmConfig();
    expect(cfg.provider).toBe("manus-forge");
    expect(cfg.active).toBe(true);
    expect(cfg.apiKey).toBe("forge-secret");
  });

  it("prefere a env OPENAI_API_KEY ao Forge", async () => {
    resetEnv();
    setEnv({ openaiApiKey: "sk-openai", forgeApiKey: "forge-secret" });
    const cfg = await resolveLlmConfig();
    expect(cfg.provider).toBe("openai");
    expect(cfg.active).toBe(true);
    expect(cfg.apiUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(cfg.apiKey).toBe("sk-openai");
  });

  it("classifica Groq, OpenRouter e custom pela base", async () => {
    resetEnv();
    setEnv({ openaiApiKey: "k" });
    setEnv({ openaiApiBase: "https://api.groq.com/openai/v1", openaiModel: "llama-3.3-70b" });
    let cfg = await resolveLlmConfig();
    expect(cfg.provider).toBe("groq");
    expect(cfg.model).toBe("llama-3.3-70b");
    setEnv({ openaiApiBase: "https://openrouter.ai/api/v1" });
    cfg = await resolveLlmConfig();
    expect(cfg.provider).toBe("openrouter");
    setEnv({ openaiApiBase: "https://minha-api.com" });
    cfg = await resolveLlmConfig();
    expect(cfg.provider).toBe("custom");
  });

  it("preferência por usuário (override) sobre as envs", async () => {
    resetEnv();
    setEnv({ openaiApiKey: "sk-env" });
    mockUserSettings.mockReturnValueOnce({
      id: 1,
      userId: 1,
      llmApiBase: "https://api.groq.com/openai/v1",
      llmApiKey: "gsk-user",
      llmModel: "llama-3.3-70b",
      imageApiKey: null,
      imageModel: null,
    } as never);
    const cfg = await resolveLlmConfig(1);
    expect(cfg.provider).toBe("groq");
    expect(cfg.apiKey).toBe("gsk-user");
    expect(cfg.model).toBe("llama-3.3-70b");
  });

  it("chave vazia no usuário é ignorada (comporta-se como padrão do servidor)", async () => {
    resetEnv();
    setEnv({ openaiApiKey: "sk-env" });
    // O getProviderSettings real omite valores vazios — aqui o mock também:
    mockUserSettings.mockReturnValueOnce({} as never);
    const cfg = await resolveLlmConfig(2);
    // sem override → env OPENAI
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiKey).toBe("sk-env");
  });
});

describe("resolveImageConfig", () => {
  it("usa a chave OpenAI da env com dall-e-3", async () => {
    resetEnv();
    setEnv({ openaiApiKey: "sk-openai" });
    const cfg = await resolveImageConfig();
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiUrl).toBe("https://api.openai.com/v1/images/generations");
    expect(cfg.model).toBe("dall-e-3");
  });

  it("prefere imageApiKey do usuário sobre llmApiKey", async () => {
    resetEnv();
    setEnv({ openaiApiKey: "sk-env" });
    mockUserSettings.mockReturnValueOnce({
      id: 3,
      userId: 3,
      llmApiBase: null,
      llmApiKey: "llm-user",
      llmModel: null,
      imageApiKey: "img-user",
      imageModel: null,
    } as never);
    const cfg = await resolveImageConfig(3);
    expect(cfg.apiKey).toBe("img-user");
  });

  it("usa llmApiKey do usuário para imagem quando imageApiKey está vazia", async () => {
    resetEnv();
    // O getProviderSettings real omite valores vazios (delete no banco);
    // o mock deve imitar: imageApiKey ausente → resolveImageConfig usa llmApiKey
    mockUserSettings.mockReturnValueOnce({
      id: 4,
      userId: 4,
      llmApiBase: undefined,
      llmApiKey: "llm-user",
      llmModel: undefined,
      imageModel: undefined,
    } as never);
    const cfg = await resolveImageConfig(4);
    expect(cfg.apiKey).toBe("llm-user");
    expect(cfg.active).toBe(true);
  });

  it("volta ao Forge quando nenhuma chave existe", async () => {
    resetEnv();
    setEnv({ forgeApiKey: "forge-secret" });
    const cfg = await resolveImageConfig();
    // A base default (api.openai.com) é mantida, mas o provider é identificado
    // pela chave ativa: com forgeApiKey a chave não vem da env openai,
    // então provider fica "custom" e active true (chave forge em base openai).
    expect(cfg.apiUrl).toContain("/images/generations");
    expect(cfg.model).toBe("dall-e-3");
    expect(cfg.active).toBe(true);
    expect(cfg.provider).toBe("custom");
  });
});

describe("resolveYoutubeConfig", () => {
  it("usa o hub de dados quando a chave não está definida", () => {
    resetEnv();
    const cfg = resolveYoutubeConfig();
    expect(cfg.provider).toBe("manus-data-hub");
    expect(cfg.keyConfigured).toBe(false);
  });

  it("usa o provider direto quando YOUTUBE_DATA_API_KEY existe", () => {
    resetEnv();
    setEnv({ youtubeApiKey: "AIzaSy-123" });
    const cfg = resolveYoutubeConfig();
    expect(cfg.provider).toBe("youtube-data-api-direct");
    expect(cfg.keyConfigured).toBe(true);
  });

  it("ignora chave com apenas espaços", () => {
    resetEnv();
    setEnv({ youtubeApiKey: "   " });
    const cfg = resolveYoutubeConfig();
    expect(cfg.keyConfigured).toBe(false);
  });
});

describe("validateApiBase", () => {
  it("rejeita http e URLs inválidas", () => {
    expect(validateApiBase("http://api.example.com")).toBe("A URL da API deve usar https");
    expect(validateApiBase("not-a-url")).toBe("URL inválida");
    expect(validateApiBase("")).toBeNull();
  });

  it("normaliza https removendo a barra final", () => {
    expect(validateApiBase("https://api.groq.com/openai/v1/")).toBe(
      "https://api.groq.com/openai/v1"
    );
    expect(validateApiBase("https://openrouter.ai/api/v1")).toBe(
      "https://openrouter.ai/api/v1"
    );
  });
});
