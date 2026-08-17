import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// (Rodada 42) Teto de custo SEMANAL com ação configurável (block/warn/alert) e
// custo exato por análise individual. Padrão de stubs do projeto
// (analysis-limits.test.ts): vi.hoisted + vi.mock("./db") mock total.

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
  // (Rodada 37) helpers do fluxo de bloqueio.
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
  // (Rodada 36) checagem de limites.
  checkAnalysisLimitsExtended: vi.fn().mockResolvedValue({ blocked: false }),
  getLimitStatus: vi.fn().mockResolvedValue({ blocked: false, needsConfirmation: false }),
  // (Rodada 36/42) alertas e consumo.
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
  // (Rodada 42) alerta do teto semanal de custo.
  emitWeeklyCostCapAlert: vi.fn().mockResolvedValue(undefined),
  consumeLimitOverride: vi.fn().mockResolvedValue(undefined),
  getProviderSettings: vi.fn().mockResolvedValue({ llmModel: undefined }),
  getUserLlmConfig: vi.fn().mockResolvedValue(null),
  // (Rodada 41) custo mensal por modelo.
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
  // (Rodada 42) custo semanal.
  estimateWeeklyCostBrl: vi.fn().mockResolvedValue({
    weekTokens: 0,
    weekCostBrl: 0,
    weekThumbnails: 0,
    imageCostBrl: 0,
    totalWeekCostBrl: 0,
    projectedWeekCostBrl: null,
    usdBrl: 5.6,
    fxSource: "api",
  }),
  // (Rodada 42) custo exato por análise.
  resolveLlmModel: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" as const }),
  resolveLlmPrice: vi.fn().mockResolvedValue({ model: "gpt-4.1-mini", from: "env" as const, input: 0.3, output: 1.2, fallback: false }),
  resolveImageModel: vi.fn().mockResolvedValue({ model: "dall-e-3", from: "default" as const }),
  recordAnalysisCostFor: vi.fn().mockResolvedValue(undefined),
  // Perfil / limites.
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

let lastAnalysisState = { status: "running" };
beforeEach(() => {
  vi.clearAllMocks();
  db.checkAnalysisLimitsExtended.mockResolvedValue({ blocked: false });
  db.getLimitStatus.mockResolvedValue({ blocked: false, needsConfirmation: false });
  lastAnalysisState = { status: "running" };
  db.updateAnalysis.mockImplementation(async (_id: string, patch: { status?: string }) => {
    if (patch?.status) lastAnalysisState.status = patch.status;
    db.getAnalysisById.mockResolvedValue({
      id: "last",
      userId: 12,
      niche: "finanças",
      status: lastAnalysisState.status,
      retryLog: null,
      costBrl: 0,
      costDetail: null,
    } as never);
    return undefined;
  });
  db.updateAnalysisProgress.mockResolvedValue(undefined);
  db.getUsageBudgets.mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
    week: { tokens: 0, quota: 0 },
    month: { tokens: 0, quota: 0 },
  });
});

describe("(Rodada 42) teto de custo SEMANAL — bloqueio configurável", () => {
  it("bloqueia com TOO_MANY_REQUESTS quando o teto semanal é atingido no modo block", async () => {
    db.checkAnalysisLimitsExtended.mockResolvedValue({
      blocked: true,
      reason: "Custo semanal projetado atingiu o teto de R$ 10.",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.run({ niche: "finanças" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(db.createAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 12, niche: "finanças", status: "failed" }),
    );
    expect(db.recordBlockedAttempt).toHaveBeenCalled();
  });

  it("libera (uso único) quando o teto semanal atinge no modo 'warn': registra a pendência confirmada e executa", async () => {
    // No modo 'warn', o check retorna needsConfirmation; o router registra a
    // pendência confirmada (vinculada à análise criada) e executa normalmente.
    db.getUserLimits.mockResolvedValue({
      dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, limitAction: "warn",
      weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 0,
      monthlyCostCapBrl: 0, costCapAction: "warn",
      weeklyCostCapBrl: 10, weeklyCostCapAction: "warn",
      overrideUntil: 0, overrideRemaining: 1,
    });
    db.getLatestBlockedAttemptId.mockResolvedValue(99);
    db.confirmBlockedAttempt.mockResolvedValue(undefined);
    db.checkAnalysisLimitsExtended.mockResolvedValue({
      needsConfirmation: true,
      dimension: "weekly_cost_cap",
      reason: "Custo semanal projetado atingiu o teto de R$ 10.",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const result = await caller.analysis.run({ niche: "finanças" });
    expect(result.status).toBe("completed");
    expect(db.recordAnalysisCostFor).toHaveBeenCalled();
    // A pendência confirmada fica vinculada à análise autorizada.
    const confirmCall = db.confirmBlockedAttempt.mock.calls[0];
    expect(confirmCall[0]).toBe(99);
    expect((confirmCall?.[1] as { analysisId?: unknown })?.analysisId).toBeDefined();
  });

  it("não bloqueia quando a ação do teto semanal é 'alert' (apenas notifica)", async () => {
    // No modo 'alert' o check ignora o teto semanal e libera a análise;
    // a notificação proativa é emitida dentro do check real (db.ts).
    db.getUserLimits.mockResolvedValue({
      dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, limitAction: "warn",
      weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 0,
      monthlyCostCapBrl: 0, costCapAction: "warn",
      weeklyCostCapBrl: 10, weeklyCostCapAction: "alert",
      overrideUntil: 0, overrideRemaining: 0,
    });
    db.checkAnalysisLimitsExtended.mockResolvedValue({ blocked: false });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const result = await caller.analysis.run({ niche: "finanças" });
    expect(result.status).toBe("completed");
  });

  it("persiste o teto semanal e a ação configurável via setLimits", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await caller.profile.setLimits({ weeklyCostCapBrl: 25, weeklyCostCapAction: "block" });
    // setUserLimits é chamado com (userId, obj) — validar o objeto de limites.
    const call = db.setUserLimits.mock.calls[db.setUserLimits.mock.calls.length - 1];
    expect(call).toHaveLength(2);
    expect(call[0]).toBe(12);
    expect(call[1]).toMatchObject({ weeklyCostCapBrl: 25, weeklyCostCapAction: "block" });
  });

  it("getLimits expõe os campos semanais do teto de custo", async () => {
    db.getUserLimits.mockResolvedValue({
      dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, limitAction: "block",
      weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 0,
      monthlyCostCapBrl: 0, costCapAction: "warn",
      weeklyCostCapBrl: 25, weeklyCostCapAction: "block",
      overrideUntil: 0, overrideRemaining: 0,
    });
    db.getLimitStatus.mockResolvedValue({
      blocked: false,
      needsConfirmation: false,
      weeklyCostCapBrl: 25,
      weeklyCostCapAction: "block",
    } as never);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const limits = await caller.profile.getLimits();
    expect(limits.weeklyCostCapBrl).toBe(25);
    expect(limits.weeklyCostCapAction).toBe("block");
  });
});

describe("(Rodada 42) custo exato por análise individual no histórico", () => {
  it("grava costBrl e costDetail na análise concluída e os expõe no list", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const result = await caller.analysis.run({ niche: "finanças" });
    expect(result.status).toBe("completed");
    expect(db.recordAnalysisCostFor).toHaveBeenCalledWith(
      result.id,
      12,
      1500,
      expect.any(Number),
      expect.any(String),
    );
    db.listAnalysesByUser.mockResolvedValue([{
      id: result.id,
      niche: "finanças",
      status: "completed",
      createdAt: new Date(),
      costBrl: 123,
      costDetail: JSON.stringify({ tokens: 1500, costBrl: 123 }),
    } as never]);
    const list = await caller.analysis.list();
    const item = (list as never[]).find((a: never) => (a as { id: string }).id === result.id);
    expect((item as { costBrl?: number }).costBrl).toBe(123);
    expect((item as { costDetail?: string }).costDetail).toContain("1500");
  });
});
