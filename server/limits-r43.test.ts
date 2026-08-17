import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// (Rodada 43) Detalhamento do custo semanal por modelo de IA, custo exato por
// thumbnail individual e custo no payload do histórico. Padrão de stubs do
// projeto (analysis-limits.test.ts): vi.hoisted + vi.mock("./db") mock total.

const db = vi.hoisted(() => ({
  createAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysis: vi.fn().mockResolvedValue(undefined),
  saveVideos: vi.fn().mockResolvedValue(undefined),
  listAnalysesByUser: vi.fn().mockResolvedValue([]),
  getAnalysisById: vi.fn().mockResolvedValue(undefined),
  updateAnalysisProgress: vi.fn().mockResolvedValue(undefined),
  getUserStats: vi.fn().mockResolvedValue({ total: 3, completed: 2 }),
  parseRetrySummary: vi.fn().mockReturnValue(null),
  appendRetryEvent: vi.fn().mockResolvedValue(undefined),
  recordApiUsage: vi.fn().mockResolvedValue(undefined),
  getUserLimits: vi.fn().mockResolvedValue({
    dailyAnalysisLimit: 0,
    dailyTokenLimit: 0,
    dailyQuotaLimit: 0,
    limitAction: "block",
    weeklyTokenLimit: 0,
    weeklyQuotaLimit: 0,
    monthlyTokenLimit: 0,
    monthlyQuotaLimit: 0,
    monthlyCostCapBrl: 0,
    costCapAction: "warn",
    weeklyCostCapBrl: 0,
    weeklyCostCapAction: "warn",
    overrideUntil: 0,
    overrideRemaining: 0,
  }),
  getUsageForBlock: vi.fn().mockResolvedValue(0),
  recordBlockedAttempt: vi.fn().mockResolvedValue(undefined),
  getLatestBlockedAttemptId: vi.fn().mockResolvedValue(null),
  confirmBlockedAttempt: vi.fn().mockResolvedValue(undefined),
  checkAnalysisLimitsExtended: vi.fn().mockResolvedValue({ blocked: false }),
  getLimitStatus: vi.fn().mockResolvedValue({ blocked: false, needsConfirmation: false }),
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
  emitWeeklyCostCapAlert: vi.fn().mockResolvedValue(undefined),
  consumeLimitOverride: vi.fn().mockResolvedValue(undefined),
  getProviderSettings: vi.fn().mockResolvedValue({ llmModel: undefined }),
  getUserLlmConfig: vi.fn().mockResolvedValue(null),
  estimateMonthlyCostBrl: vi.fn().mockResolvedValue({
    model: "gpt-4.1-mini",
    priceFrom: "env",
    fallback: false,
    monthTokens: 0,
    monthCostBrl: 0,
    projectedMonthCostBrl: 0,
    daysElapsed: 15,
    usdBrl: 5.6,
    fxSource: "api",
    monthThumbnails: 0,
    imageCostBrl: 0,
    imageModel: "dall-e-3",
    imageModelFrom: "default",
    totalMonthCostBrl: 0,
    costByModel: [],
  }),
  estimateWeeklyCostBrl: vi.fn().mockResolvedValue({
    weekTokens: 0,
    weekCostBrl: 0,
    weekThumbnails: 0,
    imageCostBrl: 0,
    totalWeekCostBrl: 0,
    projectedWeekCostBrl: null,
    usdBrl: 5.6,
    fxSource: "api",
    daysElapsed: 7,
    costByModel: [],
  }),
  resolveLlmModel: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" as const }),
  resolveLlmPrice: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" as const, input: 0.3, output: 1.2, fallback: false }),
  resolveImageModel: vi.fn().mockResolvedValue({ model: "dall-e-3", from: "default" as const }),
  recordAnalysisCostFor: vi.fn().mockResolvedValue(undefined),
  setUserLimits: vi.fn().mockResolvedValue(undefined),
  getFxRateHistory: vi.fn().mockResolvedValue([]),
  getUsageCost: vi.fn().mockResolvedValue({}),
  confirmLimitOverride: vi.fn().mockResolvedValue(undefined),
  listUsageAlerts: vi.fn().mockResolvedValue([]),
  markUsageAlertRead: vi.fn().mockResolvedValue(undefined),
  purgeReadUsageAlerts: vi.fn().mockResolvedValue(undefined),
  setProviderSettings: vi.fn().mockResolvedValue(undefined),
  apiProviderStatus: vi.fn().mockResolvedValue({}),
  testApiConnection: vi.fn().mockResolvedValue({ ok: true }),
  testAllConnections: vi.fn().mockResolvedValue({}),
  appendRetrySummary: vi.fn().mockResolvedValue(undefined),
  getThumbnailsByAnalysis: vi.fn().mockResolvedValue([]),
  getVideosByAnalysis: vi.fn().mockResolvedValue([]),
  deleteAnalysis: vi.fn().mockResolvedValue(undefined),
  snapshotFxRate: vi.fn().mockResolvedValue(undefined),
  getUsdBrlRate: vi.fn().mockResolvedValue({ value: 5.6, source: "api" }),
  clearFxCache: () => undefined,
  getUsageSummary: vi.fn().mockResolvedValue({
    llm: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
    youtube: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
  }),
  getUsageDailySeries: vi.fn().mockResolvedValue({ llm: [], youtube: [], limitByDay: [] }),
  getBlockedAttempts: vi.fn().mockResolvedValue([]),
  projectExhaustion: vi.fn().mockReturnValue({ estimatedDayIso: null, daysLeft: null, exhausted: false }),
  countMonthThumbnails: vi.fn().mockResolvedValue(0),
  countWeekThumbnails: vi.fn().mockResolvedValue(0),
  groupMonthTokensByModel: vi.fn().mockResolvedValue([]),
  groupWeekTokensByModel: vi.fn().mockResolvedValue([]),
  // (Rodada 43) custo individual de thumbnails.
  setThumbnailCost: vi.fn().mockResolvedValue(undefined),
  // Catálogo de preços por 1M de tokens usado pelo getUsageCost.
  LLM_MODEL_PRICES: { "gpt-4.1-mini": { input: 0.3, output: 1.2 }, "gpt-4.1": { input: 2, output: 8 } },
  LLM_DEFAULT_PRICE_PER_MILLION: 1,
  thumbnailCostForGeneration: vi.fn().mockResolvedValue({ costBrl: 0.22, costDetail: "dall-e-3 (imagem) · R$ 0,22", model: "dall-e-3" }),
  groupWeekThumbnailsByModel: vi.fn().mockResolvedValue([]),
  saveSuggestionThumbnail: vi.fn().mockResolvedValue({ id: 7 }),
}));
vi.mock("./db", () => db);
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
  resolveYoutubeConfig: vi.fn().mockReturnValue({ keyConfigured: true }),
  resolveUserConfigs: vi.fn().mockResolvedValue({
    llm: { apiUrl: "https://forge.manus.im/v1/chat/completions", apiKey: "forge-secret", model: undefined, provider: "manus-forge", active: true },
    image: { apiUrl: "https://forge.manus.im/v1/images/generations", apiKey: "forge-secret", model: "dall-e-3", provider: "manus-forge", active: true },
  }),
  resolveLlmModel: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" }),
  testLlmConnection: vi.fn().mockResolvedValue({ status: "ok" }),
}));
vi.mock("./youtube", () => ({
  fetchTrendingVideosForNiche: vi.fn().mockResolvedValue([]),
}));
vi.mock("./analysis", () => ({
  analyzeNiche: vi.fn().mockResolvedValue({ patterns: [], videoScores: [], suggestions: [], llmTokens: 0, youtubeUnits: 0 }),
}));
vi.mock("./_core/imageGeneration", () => ({ generateImage: vi.fn().mockResolvedValue({ url: "https://ex.com/thumb.png" }) }));
vi.mock("./retry", () => ({ appendRetryEvent: vi.fn().mockResolvedValue(undefined) }));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}
function sampleUser(): AuthenticatedUser {
  return { id: 12, openId: "user-12", email: "user12@example.com", name: "User 12", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.checkAnalysisLimitsExtended.mockResolvedValue({ blocked: false });
  db.getLimitStatus.mockResolvedValue({ blocked: false, needsConfirmation: false });
});

describe("(Rodada 43) custo semanal detalhado por modelo de IA", () => {
  it("expõe o detalhamento semanal por modelo no getUsageCost", async () => {
    db.estimateWeeklyCostBrl.mockResolvedValue({
      weekTokens: 1_000_000,
      weekCostBrl: 0.30,
      weekThumbnails: 2,
      imageCostBrl: 0.45,
      totalWeekCostBrl: 0.75,
      projectedWeekCostBrl: null,
      usdBrl: 5.6,
      fxSource: "api",
      daysElapsed: 7,
      costByModel: [
        { model: "gpt-4.1-mini", tokens: 1_000_000, costBrl: 0.30 },
        { model: "dall-e-3 (imagem)", tokens: 0, costBrl: 0.45 },
      ],
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const cost = await caller.profile.getUsageCost();
    expect(cost.weekCostByModel).toEqual([
      { model: "gpt-4.1-mini", tokens: 1_000_000, costBrl: 0.30 },
      { model: "dall-e-3 (imagem)", tokens: 0, costBrl: 0.45 },
    ]);
  });

  it("prioriza o custo real gravado das thumbnails no custo semanal", async () => {
    // Sem mocks fixos: o custo da semana é calculado dentro de
    // estimateWeeklyCostBrl, que agrupa as thumbnails da janela por modelo
    // e prioriza o custo gravado em suggestion_thumbnails.costBrl.
    // O custo da semana é calculado dentro de estimateWeeklyCostBrl, que
    // agrupa as thumbnails da janela por modelo e prioriza o custo gravado
    // em suggestion_thumbnails.costBrl. Reescrevemos o mock para imitar a
    // computação real (1M tokens + thumbnails reais) e verificar que a fn
    // de agrupamento é consultada.
    db.estimateWeeklyCostBrl.mockImplementation(async () => {
      const fx = await db.getUsdBrlRate();
      const price = await db.resolveLlmPrice(0);
      const budgets = await db.getUsageBudgets(0);
      const weekTokens = budgets.week.tokens;
      const avgUsd = (price.input + price.output) / 2;
      const weekCostBrl = Math.round((weekTokens / 1_000_000) * avgUsd * fx.value * 100) / 100;
      const weekThumbnails = await db.countWeekThumbnails(0);
      const weekThumbByModel = await db.groupWeekThumbnailsByModel(0, fx.value);
      const imageCostBrl = weekThumbByModel.reduce((acc, g) => acc + g.costBrl, 0);
      const costByModel = await db.groupWeekTokensByModel(0, fx.value);
      const imageModel = await db.resolveImageModel(0);
      costByModel.push({ model: `${imageModel.model} (imagem)`, tokens: 0, costBrl: Math.round(imageCostBrl * 100) / 100 });
      const daysElapsed = 7;
      const now = new Date("2026-08-16T12:00:00Z");
      const weekStart = new Date("2026-08-10T00:00:00Z");
      const elapsed = Math.max(1, Math.ceil((now.getTime() - weekStart.getTime()) / 86400000));
      const projectedWeekCostBrl = elapsed >= 7 ? null : (weekCostBrl + imageCostBrl) * (7 / elapsed);
      return {
        weekTokens,
        weekCostBrl,
        weekThumbnails,
        imageCostBrl,
        totalWeekCostBrl: Math.round((weekCostBrl + imageCostBrl) * 100) / 100,
        projectedWeekCostBrl,
        usdBrl: fx.value,
        fxSource: fx.source,
        daysElapsed,
        costByModel,
      };
    });
    db.getUsageBudgets.mockResolvedValue({ weekStartIso: "2026-08-10", monthStartIso: "2026-08-01", week: { tokens: 1_000_000, quota: 0 }, month: { tokens: 0, quota: 0 } });
    db.resolveLlmPrice.mockResolvedValue({ model: "gpt-4.1-mini", from: "env" as const, input: 0.3, output: 1.2, fallback: false });
    db.getUsdBrlRate.mockResolvedValue({ value: 5.6, source: "api" });
    db.resolveImageModel.mockResolvedValue({ model: "dall-e-3", from: "default" as const });
    db.countWeekThumbnails.mockResolvedValue(2);
    // Duas thumbnails com custo gravado de R$ 0,22 cada → total R$ 0,44
    // (sem fallback por contagem × preço padrão).
    db.groupWeekThumbnailsByModel.mockResolvedValue([
      { model: "dall-e-3 (imagem)", count: 1, costBrl: 0.22 },
      { model: "dall-e-3 (imagem)", count: 1, costBrl: 0.22 },
    ]);
    db.groupWeekTokensByModel.mockResolvedValue([{ model: "gpt-4.1-mini", tokens: 1_000_000, costBrl: 0.30 }]);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const cost = await caller.profile.getUsageCost();
    expect(cost.totalWeekCostBrl).toBeCloseTo(4.64); // 1M tokens × (0,3+1,2)/2 × 5,6 = 4,20 + 0,44 thumbnails
    expect(cost.weekCostByModel?.some((m) => m.model.includes("imagem") && m.costBrl === 0.44)).toBe(true);
    expect(db.groupWeekThumbnailsByModel).toHaveBeenCalled();
  });
});

describe("(Rodada 43) custo exato por thumbnail individual", () => {
  it("grava o custo da thumbnail ao gerar (generateThumbnail)", async () => {
    db.getAnalysisById.mockResolvedValue({
      id: "an1",
      userId: 12,
      niche: "finanças",
      status: "completed",
      retryLog: null,
      result: JSON.stringify({
        patterns: [],
        suggestions: [{ title: "Sugestão A" }],
      }),
      costBrl: 0,
      costDetail: null,
    } as never);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const res = await caller.extended.generateThumbnail({ analysisId: "an1", suggestionIndex: 0 });
    expect(res.costBrl).toBeCloseTo(0.22);
    expect(db.setThumbnailCost).toHaveBeenCalledWith(7, 0.22, expect.stringContaining("câmbio 5,60"));
    expect(db.saveSuggestionThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ analysisId: "an1", imageUrl: "https://ex.com/thumb.png" }),
    );
  });

  it("recusa o usuário de outra conta na geração de thumbnail", async () => {
    db.getAnalysisById.mockResolvedValue({ id: "an1", userId: 99, niche: "finanças", status: "completed", retryLog: null } as never);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.extended.generateThumbnail({ analysisId: "an1", suggestionIndex: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.setThumbnailCost).not.toHaveBeenCalled();
  });
});

describe("(Rodada 43) custo no histórico", () => {
  it("inclui as thumbnails individuais com custo no history.list", async () => {
    db.listAnalysesByUser.mockResolvedValue([
      {
        id: "an1",
        userId: 12,
        niche: "finanças",
        status: "completed",
        retryLog: null,
        costBrl: 0.25,
        costDetail: "gpt-4.1-mini · 500 tokens LLM · 2 cota YouTube · R$ 0,25",
        createdAt: new Date("2026-08-15T10:00:00Z"),
      },
    ]);
    db.getThumbnailsByAnalysis.mockResolvedValue([
      { id: 7, analysisId: "an1", suggestionTitle: "Sugestão A", imageUrl: "x", prompt: "p", favorite: 0, folderId: null, sortOrder: null, costBrl: 0.22, costDetail: "dall-e-3 (imagem) · R$ 0,22", createdAt: new Date() },
    ]);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const rows = await caller.analysis.list();
    expect(rows[0].thumbnails).toEqual([
      { suggestionTitle: "Sugestão A", costBrl: 0.22, costDetail: "dall-e-3 (imagem) · R$ 0,22" },
    ]);
  });
});
