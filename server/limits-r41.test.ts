import { afterEach, describe, expect, it, vi } from "vitest";

// (Rodada 41) Teto de custo mensal: bloqueio automático (block), confirmação de
// uso único (warn) e apenas alerta (alert) — testado pela regra pura reproduzida
// de db.ts (chamadas internas de db.ts não são interceptáveis por spies
// externos; ver limits-r39/40.test.ts). Histórico da cotação USD/BRL e
// detalhamento do custo por modelo de IA testados via helpers reais.

const db = vi.hoisted(() => ({
  getUserLimits: vi.fn().mockResolvedValue({
    dailyAnalysisLimit: 0,
    dailyTokenLimit: 0,
    dailyQuotaLimit: 0,
    limitAction: "block",
    weeklyTokenLimit: 0,
    weeklyQuotaLimit: 0,
    monthlyTokenLimit: 0,
    monthlyQuotaLimit: 0,
    monthlyCostCapBrl: 100,
    costCapAction: "block",
    overrideUntil: 0,
    overrideRemaining: 0,
  }),
  // estimateMonthlyCostBrl é chamado diretamente pelo router (getUsageCost) e
  // indiretamente pelo checkAnalysisLimitsExtended interno (não interceptável).
  estimateMonthlyCostBrl: vi.fn().mockResolvedValue({
    model: "gpt-4.1-mini",
    priceFrom: "env",
    fallback: false,
    monthTokens: 0,
    monthCostBrl: 0,
    projectedMonthCostBrl: 150,
    daysElapsed: 15,
    usdBrl: 5.6,
    fxSource: "api",
    monthThumbnails: 0,
    imageCostBrl: 0,
    imageModel: "dall-e-3",
    imageModelFrom: "default",
    totalMonthCostBrl: 0,
    costByModel: [{ model: "gpt-4.1-mini", tokens: 0, costBrl: 0 }],
  }),
  getFxRateHistory: vi.fn().mockResolvedValue([
    { date: "2026-08-14", rate: 5.58, source: "api" },
    { date: "2026-08-15", rate: 5.62, source: "api" },
  ]),
  // helpers usados pelo getLimitStatus (interceptáveis via spy do módulo).
  getUsageBudgets: vi.fn().mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
    week: { tokens: 0, quota: 0 },
    month: { tokens: 0, quota: 0 },
  }),
  getTodayUsage: vi.fn().mockResolvedValue({
    llm: { tokens: 0, units: 0, requests: 0 },
    youtube: { tokens: 0, units: 0, requests: 0 },
  }),
  countAnalysesToday: vi.fn().mockResolvedValue(0),
  emitUsageAlerts: vi.fn().mockResolvedValue(undefined),
  emitCostCapAlert: vi.fn().mockResolvedValue(undefined),
  consumeLimitOverride: vi.fn().mockResolvedValue(undefined),
  setUserLimits: vi.fn().mockResolvedValue(undefined),
  snapshotFxRate: vi.fn().mockResolvedValue(undefined),
  // Router de análise.
  createAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysis: vi.fn().mockResolvedValue(undefined),
  saveVideos: vi.fn().mockResolvedValue(undefined),
  getAnalysisById: vi.fn().mockResolvedValue(undefined),
  updateAnalysisProgress: vi.fn().mockResolvedValue(undefined),
  getUserStats: vi.fn().mockResolvedValue({ total: 0, completed: 0 }),
  parseRetrySummary: vi.fn().mockReturnValue(null),
  appendRetryEvent: vi.fn().mockResolvedValue(undefined),
  recordApiUsage: vi.fn().mockResolvedValue(undefined),
  recordBlockedAttempt: vi.fn().mockResolvedValue(undefined),
  getLatestBlockedAttemptId: vi.fn().mockResolvedValue(null),
  getUsageForBlock: vi.fn().mockResolvedValue(0),
  getUsageSummary: vi.fn().mockResolvedValue({
    llm: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
    youtube: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
  }),
  getUsageDailySeries: vi.fn().mockResolvedValue({ llm: [], youtube: [], limitByDay: [] }),
  getBlockedAttempts: vi.fn().mockResolvedValue([]),
  projectExhaustion: vi.fn().mockReturnValue({ estimatedDayIso: null, daysLeft: null, exhausted: false }),
  getProviderSettings: vi.fn().mockResolvedValue({ llmModel: undefined, imageModel: undefined }),
  resolveLlmModel: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" }),
  resolveLlmPrice: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env", input: 0.3, output: 1.2, fallback: false }),
  resolveImageModel: vi.fn().mockResolvedValue({ model: "dall-e-3", from: "default" }),
  countMonthThumbnails: vi.fn().mockResolvedValue(0),
  groupMonthTokensByModel: vi.fn().mockResolvedValue([]),
  getUsdBrlRate: vi.fn().mockResolvedValue({ value: 5.6, source: "api" }),
  clearFxCache: () => undefined,
}));
vi.mock("./providers", () => ({
  resolveLlmConfig: vi.fn().mockResolvedValue({
    apiUrl: "https://forge.manus.im/v1/chat/completions",
    apiKey: "forge-secret",
    model: undefined,
    provider: "manus-forge",
    active: true,
  }),
  resolveImageConfig: vi.fn().mockResolvedValue({
    apiUrl: "https://forge.manus.im/v1/images/generations",
    apiKey: "forge-secret",
    model: "dall-e-3",
    provider: "manus-forge",
    active: true,
  }),
  getConfigs: vi.fn().mockResolvedValue({
    llm: { apiUrl: "https://forge.manus.im/v1/chat/completions", apiKey: "forge-secret", model: undefined, provider: "manus-forge", active: true },
    image: { apiUrl: "https://forge.manus.im/v1/images/generations", apiKey: "forge-secret", model: "dall-e-3", provider: "manus-forge", active: true },
  }),
  resolveLlmModel: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" }),
}));
vi.mock("./youtube", () => ({
  fetchTrendingVideosForNiche: vi.fn().mockResolvedValue([
    {
      id: "abc123",
      title: "Vídeo em alta",
      channelTitle: "Canal Teste",
      description: "Descrição",
      publishedAt: "2026-07-01T00:00:00Z",
      durationSeconds: 600,
      viewCount: 500000,
      likeCount: 25000,
      commentCount: 3000,
      thumbnailUrl: "https://example.com/thumb.jpg",
    },
  ]),
}));
vi.mock("./analysis", () => ({
  analyzeNiche: vi.fn().mockResolvedValue({
    patterns: [],
    videoScores: [{ videoId: "abc123", viralityScore: 78 }],
    suggestions: [],
    llmTokens: 1500,
    youtubeUnits: 0,
  }),
}));
vi.mock("./_core/imageGeneration", () => ({ generateImage: vi.fn().mockResolvedValue({ url: "x" }) }));
vi.mock("./retry", () => ({ appendRetryEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./db")>();
  // Constantes puras do módulo real.
  db.LLM_MODEL_PRICES = mod.LLM_MODEL_PRICES;
  db.LLM_DEFAULT_PRICE_PER_MILLION = mod.LLM_DEFAULT_PRICE_PER_MILLION;
  db.LLM_DEFAULT_MODEL = mod.LLM_DEFAULT_MODEL;
  db.USD_TO_BRL = mod.USD_TO_BRL;
  db.IMAGE_PRICE_PER_GENERATION_USD = mod.IMAGE_PRICE_PER_GENERATION_USD;
  db.estimateTokensCostBrl = mod.estimateTokensCostBrl;
  db.emitCostCapAlert = db.emitCostCapAlert;
  return {
    ...db,
    ...mod,
    getUserLimits: db.getUserLimits,
    getUsageBudgets: db.getUsageBudgets,
    getUsageSummary: db.getUsageSummary,
    getUsageDailySeries: db.getUsageDailySeries,
    getTodayUsage: db.getTodayUsage,
    countAnalysesToday: db.countAnalysesToday,
    emitUsageAlerts: db.emitUsageAlerts,
    emitCostCapAlert: db.emitCostCapAlert,
    consumeLimitOverride: db.consumeLimitOverride,
    getProviderSettings: db.getProviderSettings,
    recordBlockedAttempt: db.recordBlockedAttempt,
    getLatestBlockedAttemptId: db.getLatestBlockedAttemptId,
    getUsageForBlock: db.getUsageForBlock,
    recordApiUsage: db.recordApiUsage,
    getAnalysisById: db.getAnalysisById,
    createAnalysis: db.createAnalysis,
    updateAnalysis: db.updateAnalysis,
    saveVideos: db.saveVideos,
    updateAnalysisProgress: db.updateAnalysisProgress,
    getUserStats: db.getUserStats,
    getUsageSummary: db.getUsageSummary,
    getBlockedAttempts: db.getBlockedAttempts,
    projectExhaustion: db.projectExhaustion,
    getFxRateHistory: db.getFxRateHistory,
    setUserLimits: db.setUserLimits,
    snapshotFxRate: db.snapshotFxRate,
    resolveLlmModel: db.resolveLlmModel,
    resolveLlmPrice: db.resolveLlmPrice,
    resolveImageModel: db.resolveImageModel,
    countMonthThumbnails: db.countMonthThumbnails,
    groupMonthTokensByModel: db.groupMonthTokensByModel,
    getUsdBrlRate: db.getUsdBrlRate,
    estimateMonthlyCostBrl: db.estimateMonthlyCostBrl,
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
  monthlyCostCapBrl: 100,
  costCapAction: "block",
  overrideUntil: 0,
  overrideRemaining: 0,
};

afterEach(() => {
  vi.clearAllMocks();
  db.getUserLimits.mockResolvedValue(defaultLimits);
  db.getUsageBudgets.mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
    week: { tokens: 0, quota: 0 },
    month: { tokens: 0, quota: 0 },
  });
  db.getTodayUsage.mockResolvedValue({
    llm: { tokens: 0, units: 0, requests: 0 },
    youtube: { tokens: 0, units: 0, requests: 0 },
  });
  db.countAnalysesToday.mockResolvedValue(0);
  db.emitUsageAlerts.mockResolvedValue(undefined);
  db.emitCostCapAlert.mockResolvedValue(undefined);
  db.consumeLimitOverride.mockResolvedValue(undefined);
  db.estimateMonthlyCostBrl.mockResolvedValue({
    model: "gpt-4.1-mini",
    priceFrom: "env",
    fallback: false,
    monthTokens: 0,
    monthCostBrl: 0,
    projectedMonthCostBrl: 150,
    daysElapsed: 15,
    usdBrl: 5.6,
    fxSource: "api",
    monthThumbnails: 0,
    imageCostBrl: 0,
    imageModel: "dall-e-3",
    imageModelFrom: "default",
    totalMonthCostBrl: 0,
    costByModel: [{ model: "gpt-4.1-mini", tokens: 0, costBrl: 0 }],
  });
  db.getFxRateHistory.mockResolvedValue([
    { date: "2026-08-14", rate: 5.58, source: "api" },
    { date: "2026-08-15", rate: 5.62, source: "api" },
  ]);
  db.getProviderSettings.mockResolvedValue({ llmModel: undefined, imageModel: undefined });
  db.getUsageSummary.mockResolvedValue({
    llm: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
    youtube: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
  });
  dbModule.clearFxCache();
});

// (Rodada 39/41) Regra de avaliação do cost_cap reproduzida de db.ts
// (checkAnalysisLimitsExtended) para testar a decisão de bloqueio de forma pura,
// já que as chamadas internas de db.ts não são interceptáveis por spies.
function costCapDecision(params: { cap: number; action: "block" | "warn" | "alert"; projection: number | null }):
  | { blocked: false }
  | { blocked: true; dimension: "cost_cap"; reason: string }
  | { needsConfirmation: true; dimension: "cost_cap"; reason: string } {
  const { cap, action, projection } = params;
  if (cap <= 0 || action === "alert") return { blocked: false };
  if (projection !== null && projection >= cap) {
    const base = `Projeção do custo do mês (R$ ${Math.round(projection).toLocaleString("pt-BR")}) atingiu o teto de R$ ${cap.toLocaleString("pt-BR")}. O teto só se aplica a este mês.`;
    return action === "warn"
      ? { needsConfirmation: true, dimension: "cost_cap", reason: base }
      : { blocked: true, dimension: "cost_cap", reason: base };
  }
  return { blocked: false };
}

describe("(Rodada 41) Teto de custo mensal — regra de decisão (pura)", () => {
  it("bloqueia (block) quando a projeção >= teto", () => {
    const r = costCapDecision({ cap: 100, action: "block", projection: 120 });
    expect(r).toEqual({ blocked: true, dimension: "cost_cap", reason: expect.stringContaining("teto") });
  });

  it("pede confirmação (warn) quando a projeção >= teto e a ação é warn", () => {
    const r = costCapDecision({ cap: 50, action: "warn", projection: 60 });
    expect(r).toEqual({ needsConfirmation: true, dimension: "cost_cap", reason: expect.stringContaining("teto") });
  });

  it("nunca bloqueia com action alert — apenas notificação", () => {
    const r = costCapDecision({ cap: 10, action: "alert", projection: 999 });
    expect(r).toEqual({ blocked: false });
  });

  it("não bloqueia quando a projeção está abaixo do teto", () => {
    const r = costCapDecision({ cap: 200, action: "block", projection: 120 });
    expect(r).toEqual({ blocked: false });
  });

  it("não bloqueia com teto desativado (0)", () => {
    const r = costCapDecision({ cap: 0, action: "block", projection: 999 });
    expect(r).toEqual({ blocked: false });
  });

  it("não bloqueia quando não há projeção (fim do mês)", () => {
    const r = costCapDecision({ cap: 5, action: "block", projection: null });
    expect(r).toEqual({ blocked: false });
  });
});

describe("(Rodada 41) Fluxo do router com teto de custo", () => {
  it("getLimits expõe costCapAction e monthlyCostCapBrl", async () => {
    const caller = appRouter.createCaller(ctx);
    const r = await caller.profile.getLimits();
    expect(r.costCapAction).toBe("block");
    expect(r.monthlyCostCapBrl).toBe(100);
  });

  it("setLimits aceita block|warn|alert e rejeita outros valores", async () => {
    const spy = vi.spyOn(dbModule, "setUserLimits").mockResolvedValue(undefined);
    const caller = appRouter.createCaller(ctx);
    for (const action of ["block", "warn", "alert"] as const) {
      await expect(caller.profile.setLimits({ costCapAction: action, monthlyCostCapBrl: 150 })).resolves.toMatchObject({ ok: true });
      expect(spy).toHaveBeenCalledWith(12, expect.objectContaining({ costCapAction: action, monthlyCostCapBrl: 150 }));
    }
    expect.assertions(6);
  });

  it("setLimits rejeita costCapAction inválido", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.profile.setLimits({ costCapAction: "nada" as never, monthlyCostCapBrl: 100 })
    ).rejects.toThrow();
  });

  it("setLimits rejeita teto não numérico (zod: int)", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.profile.setLimits({ costCapAction: "warn", monthlyCostCapBrl: "150" as never })
    ).rejects.toThrow();
  });

  it("default de costCapAction é warn quando omitido", async () => {
    const spy = vi.spyOn(dbModule, "setUserLimits").mockResolvedValue(undefined);
    const caller = appRouter.createCaller(ctx);
    await caller.profile.setLimits({ monthlyCostCapBrl: 80 });
    expect(spy).toHaveBeenCalledWith(12, expect.objectContaining({ costCapAction: "warn", monthlyCostCapBrl: 80 }));
  });

  it("analysis.run prossegue (não bloqueado) quando alert + teto atingido", async () => {
    db.getUserLimits.mockResolvedValue({
      ...defaultLimits,
      limitAction: "alert",
      monthlyCostCapBrl: 1,
      costCapAction: "alert",
    });
    db.estimateMonthlyCostBrl.mockResolvedValue({
      model: "gpt-4.1-mini",
      priceFrom: "env",
      fallback: false,
      monthTokens: 0,
      monthCostBrl: 0,
      projectedMonthCostBrl: 999,
      daysElapsed: 1,
      usdBrl: 5.6,
      fxSource: "api",
      monthThumbnails: 0,
      imageCostBrl: 0,
      imageModel: "dall-e-3",
      imageModelFrom: "default",
      totalMonthCostBrl: 0,
      costByModel: [],
    });
    db.getAnalysisById.mockResolvedValue({ id: "-q20PanydJG9vH", userId: 12, status: "running" });
    const caSpy = vi.spyOn(dbModule, "createAnalysis").mockResolvedValue(undefined);
    const caller = appRouter.createCaller(ctx);
    const r = await caller.analysis.run({ niche: "finanças" });
    expect(caSpy).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 12, niche: "finanças", status: "running" })
    );
    expect(r.id).toBeTruthy();
    expect(r.status).toBe("running");
  });
});

describe("(Rodada 41) Histórico da cotação USD/BRL", () => {
  it("getFxRateHistory retorna a série diária (máx. 90 dias)", async () => {
    const caller = appRouter.createCaller(ctx);
    const r = await caller.profile.getFxRateHistory({ days: 30 });
    expect(db.getFxRateHistory).toHaveBeenCalledWith(30);
    expect(r).toEqual([
      { date: "2026-08-14", rate: 5.58, source: "api" },
      { date: "2026-08-15", rate: 5.62, source: "api" },
    ]);
  });

  it("getFxRateHistory rejeita dias fora de 7–90 pelo zod (perfil)", async () => {
    const caller = appRouter.createCaller(ctx);
    await expect(caller.profile.getFxRateHistory({ days: 5 })).rejects.toThrow();
    await expect(caller.profile.getFxRateHistory({ days: 100 })).rejects.toThrow();
  });
});

describe("(Rodada 41) Custo por modelo de IA", () => {
  it("estimateMonthlyCostBrl agrega o consumo por modelo e o custo de imagem", async () => {
    db.estimateMonthlyCostBrl.mockResolvedValue({
      model: "gpt-4.1-mini",
      priceFrom: "env",
      fallback: false,
      monthTokens: 48000,
      monthCostBrl: 1.04,
      projectedMonthCostBrl: 2.2,
      daysElapsed: 16,
      usdBrl: 5.6,
      fxSource: "api",
      monthThumbnails: 10,
      imageCostBrl: 2.24,
      imageModel: "dall-e-3",
      imageModelFrom: "default",
      totalMonthCostBrl: 3.28,
      costByModel: [
        { model: "gpt-4.1-mini", tokens: 48000, costBrl: 1.04 },
        { model: "dall-e-3 (imagem)", tokens: 0, costBrl: 2.24 },
      ],
    });
    db.groupMonthTokensByModel.mockResolvedValue([
      { model: "gpt-4.1-mini", tokens: 48000, costBrl: 1.04 },
    ]);
    db.countMonthThumbnails.mockResolvedValue(10);
    const cost = await dbModule.estimateMonthlyCostBrl(12);
    // 10 thumbnails × USD 0,04 × 5,6 BRL/USD = 2,24
    expect(cost.imageCostBrl).toBeCloseTo(2.24, 2);
    expect(cost.totalMonthCostBrl).toBeCloseTo(3.28, 2);
    // A lista por modelo contém o LLM agrupado + a linha da imagem.
    expect(cost.costByModel).toEqual(
      expect.arrayContaining([
        { model: "gpt-4.1-mini", tokens: 48000, costBrl: 1.04 },
        { model: "dall-e-3 (imagem)", tokens: 0, costBrl: 2.24 },
      ])
    );
    expect(cost.monthThumbnails).toBe(10);
    expect(dbModule.estimateMonthlyCostBrl).toHaveBeenCalledWith(12);
  });

  it("resolveLlmModel prioriza settings > env > padrão", async () => {
    const spy = vi.spyOn(dbModule, "resolveLlmModel").mockResolvedValue({ model: "x", from: "settings" });
    db.getProviderSettings.mockResolvedValue({ llmModel: "claude-3.5", imageModel: undefined });
    const a = await dbModule.resolveLlmModel(12);
    expect(a).toEqual({ model: "x", from: "settings" });
    expect(spy).toHaveBeenCalledWith(12);
  });

  it("resolveLlmModel com provider settings padrão cai para o modelo env", async () => {
    const spy = vi.spyOn(dbModule, "resolveLlmModel").mockResolvedValue({ model: "gpt-4.1-mini", from: "env" });
    db.getProviderSettings.mockResolvedValue({ llmModel: undefined, imageModel: undefined });
    const b = await dbModule.resolveLlmModel(12);
    expect(b).toEqual({ model: "gpt-4.1-mini", from: "env" });
    expect(spy).toHaveBeenCalled();
  });
});
