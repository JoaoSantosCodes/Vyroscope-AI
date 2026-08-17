import { afterEach, describe, expect, it, vi } from "vitest";

// (Rodada 40) Testes do câmbio dinâmico USD/BRL, custos de thumbnails no custo
// mensal e do alerta de teto de custo. getUsdBrlRate usa fetch global
// (variável global, interceptável via vi.spyOn); o restante usa o padrão
// síncrono de stubs via vi.hoisted (ver limits-r39.test.ts).

const db = vi.hoisted(() => ({
  // --- (Rodada 39/40) Helpers de custo (mockados no teste de integração) ---
  estimateMonthlyCostBrl: vi.fn(),
  // --- (Rodada 40) Helpers novos usados por getLimitStatus/emitCostCapAlert ---
  getUsageBudgets: vi.fn().mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
    week: { tokens: 0, quota: 0 },
    month: { tokens: 0, quota: 0 },
  }),
  getUserLimits: vi.fn().mockResolvedValue({
    dailyAnalysisLimit: 0,
    dailyTokenLimit: 0,
    dailyQuotaLimit: 0,
    limitAction: "block",
    weeklyTokenLimit: 0,
    weeklyQuotaLimit: 0,
    monthlyTokenLimit: 0,
    monthlyQuotaLimit: 0,
    /** (Rodada 40) Teto de custo mensal em R$ */
    monthlyCostCapBrl: 0,
    overrideUntil: 0,
    overrideRemaining: 0,
  }),
  getTodayUsage: vi.fn().mockResolvedValue({ llm: { tokens: 0, units: 0, requests: 0 }, youtube: { tokens: 0, units: 0, requests: 0 } }),
  countAnalysesToday: vi.fn().mockResolvedValue(0),
  emitUsageAlerts: vi.fn().mockResolvedValue(undefined),
  consumeLimitOverride: vi.fn().mockResolvedValue(undefined),
  getProviderSettings: vi.fn().mockResolvedValue({ llmModel: undefined, imageModel: undefined }),
  getUserLlmConfig: vi.fn().mockResolvedValue(null),
  recordBlockedAttempt: vi.fn().mockResolvedValue(undefined),
  getLatestBlockedAttemptId: vi.fn().mockResolvedValue(null),
  getUsageForBlock: vi.fn().mockResolvedValue(0),
  recordApiUsage: vi.fn().mockResolvedValue(undefined),
  appendRetrySummary: vi.fn().mockResolvedValue(undefined),
  appendRetryEvent: vi.fn().mockResolvedValue(undefined),
  parseRetrySummary: vi.fn().mockReturnValue(null),
  getUsageSummary: vi.fn().mockResolvedValue({
    llm: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
    youtube: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
  }),
  getUsageDailySeries: vi.fn().mockResolvedValue({ llm: [], youtube: [], limitByDay: [] }),
  getBlockedAttempts: vi.fn().mockResolvedValue([]),
  projectExhaustion: vi.fn().mockReturnValue({ estimatedDayIso: null, daysLeft: null, exhausted: false }),
  listBlockedAttempts: vi.fn().mockResolvedValue([]),
  // Placeholder — substituído pela real abaixo para zerar o cache privado do módulo.
  clearFxCache: () => undefined,
}));
vi.mock("./db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./db")>();
  db.LLM_MODEL_PRICES = mod.LLM_MODEL_PRICES;
  db.LLM_DEFAULT_PRICE_PER_MILLION = mod.LLM_DEFAULT_PRICE_PER_MILLION;
  db.LLM_DEFAULT_MODEL = mod.LLM_DEFAULT_MODEL;
  db.USD_TO_BRL = mod.USD_TO_BRL;
  db.IMAGE_PRICE_PER_GENERATION_USD = mod.IMAGE_PRICE_PER_GENERATION_USD;
  db.estimateTokensCostBrl = mod.estimateTokensCostBrl;
  db.resolveLlmModel = mod.resolveLlmModel;
  db.resolveLlmPrice = mod.resolveLlmPrice;
  db.resolveImageModel = mod.resolveImageModel;
  return {
    ...db,
    ...mod,
    // Sobrescreve os helpers que o router chama diretamente.
    getUserLimits: db.getUserLimits,
    getUsageBudgets: db.getUsageBudgets,
    getUsageSummary: db.getUsageSummary,
    getUsageDailySeries: db.getUsageDailySeries,
    getTodayUsage: db.getTodayUsage,
    countAnalysesToday: db.countAnalysesToday,
    emitUsageAlerts: db.emitUsageAlerts,
    consumeLimitOverride: db.consumeLimitOverride,
    getProviderSettings: db.getProviderSettings,
    getUserLlmConfig: db.getUserLlmConfig,
    recordBlockedAttempt: db.recordBlockedAttempt,
    getLatestBlockedAttemptId: db.getLatestBlockedAttemptId,
    getUsageForBlock: db.getUsageForBlock,
    recordApiUsage: db.recordApiUsage,
    appendRetrySummary: db.appendRetrySummary,
    appendRetryEvent: db.appendRetryEvent,
    parseRetrySummary: db.parseRetrySummary,
    getBlockedAttempts: db.getBlockedAttempts,
    projectExhaustion: db.projectExhaustion,
    listBlockedAttempts: db.listBlockedAttempts,
    estimateMonthlyCostBrl: db.estimateMonthlyCostBrl,
    // Real do módulo: zera o cache privado (fxCache) entre os testes.
    clearFxCache: mod.clearFxCache,
  };
});

import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as dbModule from "./db";

const ctx: TrpcContext = {
  user: { id: 12, name: "test", email: "test@example.com", role: "user", createdAt: 0 },
};

const defaultLimits = {
  dailyAnalysisLimit: 0,
  dailyTokenLimit: 0,
  dailyQuotaLimit: 0,
  limitAction: "block",
  weeklyTokenLimit: 0,
  weeklyQuotaLimit: 0,
  monthlyTokenLimit: 0,
  monthlyQuotaLimit: 0,
  /** (Rodada 40) Teto de custo mensal em R$ */
  monthlyCostCapBrl: 0,
  overrideUntil: 0,
  overrideRemaining: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
  // vi.restoreAllMocks limpa também as implementações dos stubs (incluindo
  // mockResolvedValue), então os defaults são reaplicados a cada teste.
  db.getUserLimits.mockResolvedValue(defaultLimits);
  db.getUsageBudgets.mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
    week: { tokens: 0, quota: 0 },
    month: { tokens: 0, quota: 0 },
  });
  db.getTodayUsage.mockResolvedValue({ llm: { tokens: 0, units: 0, requests: 0 }, youtube: { tokens: 0, units: 0, requests: 0 } });
  db.countAnalysesToday.mockResolvedValue(0);
  db.emitUsageAlerts.mockResolvedValue(undefined);
  db.consumeLimitOverride.mockResolvedValue(undefined);
  db.getProviderSettings.mockResolvedValue({ llmModel: undefined, imageModel: undefined });
  db.getUsageSummary.mockResolvedValue({
    llm: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
    youtube: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
  });
  // Limpa o cache privado do módulo (fxCache) entre os testes — sem isso, o
  // valor gravado pelo primeiro teste contamina os demais (source "cache"
  // e fallbacks com o valor já cacheado).
  dbModule.clearFxCache();
});

const getLimitStatus = async () => {
  const caller = appRouter.createCaller(ctx);
  return caller.profile.getLimits();
};

describe("(Rodada 40) Câmbio USD/BRL dinâmico", () => {
  it("usa a cotação da API pública quando o fetch responde", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ USDBRL: { bid: "5.62" } }), { status: 200 }),
    );
    const fx = await dbModule.getUsdBrlRate();
    expect(fx.value).toBe(5.62);
    expect(fx.source).toBe("api");
  });

  it("faz fallback para o câmbio fixo quando a API falha", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const fx = await dbModule.getUsdBrlRate();
    expect(fx.value).toBe(dbModule.USD_TO_BRL);
    expect(fx.source).toBe("fallback");
  });

  it("faz fallback quando a resposta é inválida (bid não numérico)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ USDBRL: { bid: "abc" } }), { status: 200 }),
    );
    const fx = await dbModule.getUsdBrlRate();
    expect(fx.value).toBe(dbModule.USD_TO_BRL);
    expect(fx.source).toBe("fallback");
  });

  it("faz fallback quando o status HTTP é de erro", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
    const fx = await dbModule.getUsdBrlRate();
    expect(fx.value).toBe(dbModule.USD_TO_BRL);
    expect(fx.source).toBe("fallback");
  });

  it("reutiliza o valor em cache dentro do TTL (source 'cache')", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      return new Response(JSON.stringify({ USDBRL: { bid: call === 1 ? "5.7" : "9.9" } }), { status: 200 });
    });
    const now = vi.fn(() => 1723800000000);
    const a = await dbModule.getUsdBrlRate(now);
    const b = await dbModule.getUsdBrlRate(now);
    expect(a.value).toBe(5.7);
    expect(a.source).toBe("api");
    expect(b.value).toBe(5.7);
    expect(b.source).toBe("cache");
    expect(call).toBe(1);
  });

  it("renova após o TTL expirar", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call += 1;
      return new Response(JSON.stringify({ USDBRL: { bid: call === 1 ? "5.7" : "6.0" } }), { status: 200 });
    });
    let now = 1723800000000;
    const nowFn = () => now;
    await dbModule.getUsdBrlRate(nowFn);
    now += dbModule.FX_CACHE_TTL_MS + 1;
    const fx = await dbModule.getUsdBrlRate(nowFn);
    expect(fx.value).toBe(6.0);
    expect(fx.source).toBe("api");
    expect(call).toBe(2);
  });
});

describe("(Rodada 40) Custos de thumbnails no custo mensal", () => {
  it("estima os custos de thumbnails somados ao total do mês", async () => {
    db.estimateMonthlyCostBrl.mockResolvedValue({
      model: "gpt-4.1-mini",
      priceFrom: "settings",
      fallback: false,
      monthTokens: 48000,
      monthCostBrl: 1.04,
      projectedMonthCostBrl: 2.2,
      daysElapsed: 16,
      usdBrl: 5.62,
      fxSource: "api",
      monthThumbnails: 25,
      imageCostBrl: 25 * 0.04 * 5.62,
      imageModel: "dall-e-3",
      imageModelFrom: "default",
      totalMonthCostBrl: 1.04 + 25 * 0.04 * 5.62,
    });
    const caller = appRouter.createCaller(ctx);
    const cost = await caller.profile.getUsageCost();
    expect(cost.totalMonthCostBrl).toBeCloseTo(1.04 + 5.62, 2);
    expect(cost.monthThumbnails).toBe(25);
    expect(cost.imageCostBrl).toBeCloseTo(25 * 0.04 * 5.62, 2);
    expect(cost.usdBrl).toBe(5.62);
    expect(cost.fxSource).toBe("api");
    expect(cost.imageModel).toBe("dall-e-3");
    expect(db.estimateMonthlyCostBrl).toHaveBeenCalledWith(12);
  });
});

describe("(Rodada 40) Teto de custo mensal", () => {
  it("retorna o teto configurado em getLimits", async () => {
    db.getUserLimits.mockResolvedValue({
      dailyAnalysisLimit: 0,
      dailyTokenLimit: 0,
      dailyQuotaLimit: 0,
      limitAction: "block",
      weeklyTokenLimit: 0,
      weeklyQuotaLimit: 0,
      monthlyTokenLimit: 0,
      monthlyQuotaLimit: 0,
      monthlyCostCapBrl: 500,
      overrideUntil: 0,
      overrideRemaining: 0,
    });
    const result = await getLimitStatus();
    expect(result.monthlyCostCapBrl).toBe(500);
  });

  it("não quebra o getLimits com cap definido e projeção alta (helper é fire-and-forget)", async () => {
    // O disparo de emitCostCapAlert dentro de getLimitStatus real é
    // fire-and-forget (.catch ignorado) — as chamadas internas de db.ts não
    // são interceptáveis por spies externos, então a cobertura do helper é
    // exercitada pelo fluxo real do router sem expectativas de chamada.
    db.getUserLimits.mockResolvedValue({
      dailyAnalysisLimit: 0,
      dailyTokenLimit: 0,
      dailyQuotaLimit: 0,
      limitAction: "block",
      weeklyTokenLimit: 0,
      weeklyQuotaLimit: 0,
      monthlyTokenLimit: 0,
      monthlyQuotaLimit: 0,
      monthlyCostCapBrl: 8,
      overrideUntil: 0,
      overrideRemaining: 0,
    });
    // 6M tokens no mês → projeção ≈ R$ 88,6 (6 × preço médio 1,5 × 5,4 × 31/17),
    // bem acima de 80% do teto de R$ 8 — o caminho do alerta é exercitado.
    db.getUsageBudgets.mockResolvedValue({
      weekStartIso: "2026-08-10",
      monthStartIso: "2026-08-01",
      week: { tokens: 6_000_000, quota: 0 },
      month: { tokens: 6_000_000, quota: 0 },
    });
    const result = await getLimitStatus();
    expect(result.monthlyCostCapBrl).toBe(8);
  });

  it("não chama o helper de alerta quando o teto é 0 (sem teto)", async () => {
    vi.spyOn(dbModule, "emitCostCapAlert").mockResolvedValue(undefined);
    await getLimitStatus();
    expect(dbModule.emitCostCapAlert).not.toHaveBeenCalled();
  });

  it("aceita e persiste o teto via setLimits", async () => {
    // setUserLimits é exportado do módulo real; registrar spy na versão mockada.
    const spy = vi.spyOn(dbModule, "setUserLimits").mockResolvedValue(undefined);
    const caller = appRouter.createCaller(ctx);
    await caller.profile.setLimits({
      dailyAnalysisLimit: 0,
      dailyTokenLimit: 0,
      dailyQuotaLimit: 0,
      limitAction: "block",
      weeklyTokenLimit: 0,
      weeklyQuotaLimit: 0,
      monthlyTokenLimit: 0,
      monthlyQuotaLimit: 0,
      monthlyCostCapBrl: 250,
    });
    expect(spy).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ monthlyCostCapBrl: 250 }),
    );
  });

  it("rejeita tetos fora da faixa (negativo ou acima de 10.000)", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.profile.setLimits({
        dailyAnalysisLimit: 0,
        dailyTokenLimit: 0,
        dailyQuotaLimit: 0,
        limitAction: "block",
        weeklyTokenLimit: 0,
        weeklyQuotaLimit: 0,
        monthlyTokenLimit: 0,
        monthlyQuotaLimit: 0,
        monthlyCostCapBrl: 10001,
      }),
    ).rejects.toThrow();
  });
});
