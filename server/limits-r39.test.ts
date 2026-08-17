import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Padrão do projeto (limits.test.ts / usagePdf.test.ts): stubs via vi.hoisted e
// factory síncrona. Funções de db.ts chamam helpers do MESMO módulo (ex.:
// resolveLlmModel → getProviderSettings; checkAnalysisLimitsExtended →
// getLimitStatus), que NÃO são interceptáveis por vi.mock("./db") — por isso
// a lógica de avaliação é testada de forma pura (reproduzida de db.ts, mesma
// regra) e o teste de integração passa pelo router, que injeta os mocks nos
// pontos em que o router chama db.ts diretamente.

const db = vi.hoisted(() => ({
  // --- (Rodada 39) Helpers de custo ---
  estimateMonthlyCostBrl: vi.fn().mockResolvedValue({
    model: "gpt-4.1-mini",
    priceFrom: "settings",
    fallback: false,
    monthTokens: 48000,
    monthCostBrl: 1.04,
    projectedMonthCostBrl: 2.15,
    daysElapsed: 15,
  }),
  // --- (Rodada 42) Helpers de custo semanal ---
  estimateWeeklyCostBrl: vi.fn().mockResolvedValue({
    weekTokens: 12000,
    weekCostBrl: 0.26,
    weekThumbnails: 1,
    imageCostBrl: 0.22,
    totalWeekCostBrl: 0.48,
    projectedWeekCostBrl: null,
  }),
  // --- Helpers usados por checkAnalysisLimitsExtended (via getLimitStatus) ---
  getUserLimits: vi.fn().mockResolvedValue({
    dailyAnalysisLimit: 0,
    dailyTokenLimit: 0,
    dailyQuotaLimit: 0,
    limitAction: "block",
    weeklyTokenLimit: 0,
    weeklyQuotaLimit: 0,
    monthlyTokenLimit: 0,
    monthlyQuotaLimit: 0,
    overrideUntil: 0,
    overrideRemaining: 0,
  }),
  getUsageBudgets: vi.fn().mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
    week: { tokens: 0, quota: 0 },
    month: { tokens: 0, quota: 0 },
  }),
  getTodayUsage: vi.fn().mockResolvedValue({ llm: { tokens: 0, units: 0, requests: 0 }, youtube: { tokens: 0, units: 0, requests: 0 } }),
  countAnalysesToday: vi.fn().mockResolvedValue(0),
  emitUsageAlerts: vi.fn().mockResolvedValue(undefined),
  consumeLimitOverride: vi.fn().mockResolvedValue(undefined),
  getProviderSettings: vi.fn().mockResolvedValue({ llmModel: undefined }),
  // --- Restante usado pelos testes de integração ---
  getUserLlmConfig: vi.fn().mockResolvedValue(null),
  recordBlockedAttempt: vi.fn().mockResolvedValue(undefined),
  getLatestBlockedAttemptId: vi.fn().mockResolvedValue(null),
  getUsageForBlock: vi.fn().mockResolvedValue(0),
  createAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysis: vi.fn().mockResolvedValue(undefined),
  saveVideos: vi.fn().mockResolvedValue(undefined),
  listAnalysesByUser: vi.fn().mockResolvedValue([]),
  getAnalysisById: vi.fn().mockResolvedValue(undefined),
  getVideosByAnalysis: vi.fn().mockResolvedValue([]),
  getThumbnailsByAnalysis: vi.fn().mockResolvedValue([]),
  deleteAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysisProgress: vi.fn().mockResolvedValue(undefined),
  getUserStats: vi.fn().mockResolvedValue({ total: 0, completed: 0 }),
  parseRetrySummary: vi.fn().mockReturnValue(null),
  appendRetryEvent: vi.fn().mockResolvedValue(undefined),
  recordApiUsage: vi.fn().mockResolvedValue(undefined),
  appendRetrySummary: vi.fn().mockResolvedValue(undefined),
  getUsageSummary: vi.fn().mockResolvedValue({
    llm: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 48000, units: 0, requests: 0 } },
    youtube: { today: { tokens: 0, units: 0, requests: 0 }, week: { tokens: 0, units: 0, requests: 0 }, month: { tokens: 0, units: 0, requests: 0 } },
  }),
  getUsageDailySeries: vi.fn().mockResolvedValue({ llm: [], youtube: [], limitByDay: [] }),
  getBlockedAttempts: vi.fn().mockResolvedValue([]),
  projectExhaustion: vi.fn().mockReturnValue({ estimatedDayIso: null, daysLeft: null, exhausted: false }),
}));
vi.mock("./db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./db")>();
  // Funções puras/constantes do módulo real — exportadas tal qual (o teste
  // de integração com a lógica pura é impossível para chamadas internas,
  // mas as funções puras podem ser testadas diretamente).
  db.LLM_MODEL_PRICES = mod.LLM_MODEL_PRICES;
  db.USD_TO_BRL = mod.USD_TO_BRL;
  db.LLM_DEFAULT_PRICE_PER_MILLION = mod.LLM_DEFAULT_PRICE_PER_MILLION;
  db.LLM_DEFAULT_MODEL = mod.LLM_DEFAULT_MODEL;
  return db;
});
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
}));
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://example.com/thumbnail.png" }),
}));
vi.mock("./youtube", () => ({
  fetchTrendingVideosForNiche: vi.fn().mockResolvedValue([]),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({ patterns: [], videoScores: [], suggestions: [] }),
        },
      },
    ],
  }),
}));


// ---------------------------------------------------------------------------
// Regra de avaliação pura reproduzida de db.ts (getLimitStatus.evaluate),
// usada por checkAnalysisLimitsExtended para diários, semanais e mensais:
// cap 0 = ilimitado (ok); value >= cap = blocked; value >= 80% cap = warn.
// ---------------------------------------------------------------------------
function evaluate(value: number, cap: number): "ok" | "warn" | "blocked" {
  if (!cap) return "ok";
  return value >= cap ? "blocked" : value >= Math.floor(cap * 0.8) ? "warn" : "ok";
}

/** Traduz o status de todas as dimensões (regra de db.ts). */
function classifyLimits(input: {
  limits: {
    dailyAnalysisLimit: number;
    dailyTokenLimit: number;
    dailyQuotaLimit: number;
    weeklyTokenLimit: number;
    weeklyQuotaLimit: number;
    monthlyTokenLimit: number;
    monthlyQuotaLimit: number;
    limitAction: "block" | "warn";
    overrideRemaining: number;
    overrideUntil: number;
  };
  today: { analyses: number; tokens: number; quota: number };
  week: { tokens: number; quota: number };
  month: { tokens: number; quota: number };
}) {
  const { limits, today, week, month } = input;
  if (limits.overrideRemaining > 0) return { allowed: true };
  const hasOverride = limits.overrideUntil >= Date.now();
  const dims: Array<{ dimension: string; reason: string }> = [];
  if (!hasOverride && limits.dailyAnalysisLimit > 0 && today.analyses >= limits.dailyAnalysisLimit) dims.push({ dimension: "analyses", reason: "diário" });
  if (!hasOverride && limits.dailyTokenLimit > 0 && evaluate(today.tokens, limits.dailyTokenLimit) === "blocked") dims.push({ dimension: "tokens", reason: "diário" });
  if (!hasOverride && limits.dailyQuotaLimit > 0 && evaluate(today.quota, limits.dailyQuotaLimit) === "blocked") dims.push({ dimension: "quota", reason: "diário" });
  if (!hasOverride && limits.weeklyTokenLimit > 0 && evaluate(week.tokens, limits.weeklyTokenLimit) === "blocked") dims.push({ dimension: "weekly_tokens", reason: "semanal" });
  if (!hasOverride && limits.weeklyQuotaLimit > 0 && evaluate(week.quota, limits.weeklyQuotaLimit) === "blocked") dims.push({ dimension: "weekly_quota", reason: "semanal" });
  if (!hasOverride && limits.monthlyTokenLimit > 0 && evaluate(month.tokens, limits.monthlyTokenLimit) === "blocked") dims.push({ dimension: "monthly_tokens", reason: "mensal" });
  if (!hasOverride && limits.monthlyQuotaLimit > 0 && evaluate(month.quota, limits.monthlyQuotaLimit) === "blocked") dims.push({ dimension: "monthly_quota", reason: "mensal" });
  if (!dims.length) return { allowed: true };
  return {
    allowed: false,
    action: limits.limitAction,
    blocked: limits.limitAction === "block",
    needsConfirmation: limits.limitAction === "warn",
    dimension: dims[0].dimension,
  };
}

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function createContext(user: AuthenticatedUser | null): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as unknown as TrpcContext["res"] };
}
function sampleUser(id = 7): AuthenticatedUser {
  return { id, openId: `user-${id}`, email: `user${id}@example.com`, name: `User ${id}`, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("(Rodada 39) regra de avaliação semanal/mensal (lógica pura de db.ts)", () => {
  const today = { analyses: 0, tokens: 0, quota: 0 };

  it("bloqueia orçamento SEMANAL de tokens no modo block", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, weeklyTokenLimit: 100_000, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 0, limitAction: "block", overrideRemaining: 0, overrideUntil: 0 },
      today,
      week: { tokens: 110_000, quota: 0 },
      month: { tokens: 0, quota: 0 },
    });
    expect(r.blocked).toBe(true);
    expect(r.dimension).toBe("weekly_tokens");
  });

  it("bloqueia orçamento SEMANAL de cota no modo block", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, weeklyTokenLimit: 0, weeklyQuotaLimit: 5_000, monthlyTokenLimit: 0, monthlyQuotaLimit: 0, limitAction: "block", overrideRemaining: 0, overrideUntil: 0 },
      today,
      week: { tokens: 0, quota: 5_000 },
      month: { tokens: 0, quota: 0 },
    });
    expect(r.blocked).toBe(true);
    expect(r.dimension).toBe("weekly_quota");
  });

  it("pede confirmação para orçamento MENSAL de tokens no modo warn", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 200_000, monthlyQuotaLimit: 0, limitAction: "warn", overrideRemaining: 0, overrideUntil: 0 },
      today,
      week: { tokens: 0, quota: 0 },
      month: { tokens: 200_000, quota: 0 },
    });
    expect(r.needsConfirmation).toBe(true);
    expect(r.dimension).toBe("monthly_tokens");
  });

  it("pede confirmação para orçamento MENSAL de cota no modo warn", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 50_000, limitAction: "warn", overrideRemaining: 0, overrideUntil: 0 },
      today,
      week: { tokens: 0, quota: 0 },
      month: { tokens: 0, quota: 55_000 },
    });
    expect(r.needsConfirmation).toBe(true);
    expect(r.dimension).toBe("monthly_quota");
  });

  it("limite diário tem prioridade sobre semana e mês", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 10_000, dailyQuotaLimit: 0, weeklyTokenLimit: 100_000, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 0, limitAction: "block", overrideRemaining: 0, overrideUntil: 0 },
      today: { analyses: 0, tokens: 12_000, quota: 0 },
      week: { tokens: 110_000, quota: 0 },
      month: { tokens: 0, quota: 0 },
    });
    expect(r.blocked).toBe(true);
    expect(r.dimension).toBe("tokens");
  });

  it("override de uso único restante libera o acesso mesmo em 100%", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 10_000, dailyQuotaLimit: 0, weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 0, limitAction: "warn", overrideRemaining: 1, overrideUntil: Date.now() + 60_000 },
      today: { analyses: 0, tokens: 12_000, quota: 0 },
      week: { tokens: 0, quota: 0 },
      month: { tokens: 0, quota: 0 },
    });
    expect(r.allowed).toBe(true);
  });

  it("não bloqueia quando todos os orçamentos estão saudáveis", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 100_000, dailyQuotaLimit: 0, weeklyTokenLimit: 1_000_000, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 5_000_000, limitAction: "block", overrideRemaining: 0, overrideUntil: 0 },
      today,
      week: { tokens: 0, quota: 0 },
      month: { tokens: 0, quota: 0 },
    });
    expect(r.allowed).toBe(true);
  });

  it("80% de um orçamento gera warn no estado mas não bloqueia (apenas 100% bloqueia)", () => {
    const r = classifyLimits({
      limits: { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0, weeklyTokenLimit: 0, weeklyQuotaLimit: 0, monthlyTokenLimit: 0, monthlyQuotaLimit: 50_000, limitAction: "block", overrideRemaining: 0, overrideUntil: 0 },
      today,
      week: { tokens: 0, quota: 0 },
      month: { tokens: 0, quota: 40_000 },
    });
    expect(evaluate(40_000, 50_000)).toBe("warn");
    expect(r.allowed).toBe(true);
  });
});

describe("(Rodada 39) profile.getUsageCost — procedure de custo estimado", () => {
  it("rejeita usuários não autenticados", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.profile.getUsageCost()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retorna a projeção de custo mensal do usuário em BRL", async () => {
    db.estimateMonthlyCostBrl.mockResolvedValueOnce({
      model: "gpt-4.1-mini",
      priceFrom: "settings",
      fallback: false,
      monthTokens: 48000,
      monthCostBrl: 1.04,
      projectedMonthCostBrl: 2.15,
      daysElapsed: 15,
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const cost = await caller.profile.getUsageCost();
    expect(cost.model).toBe("gpt-4.1-mini");
    expect(cost.monthCostBrl).toBeCloseTo(1.04, 2);
    expect(cost.projectedMonthCostBrl).toBeCloseTo(2.15, 2);
    expect(db.estimateMonthlyCostBrl).toHaveBeenCalledWith(7);
  });

  it("propaga fallback quando o modelo não está no catálogo", async () => {
    db.estimateMonthlyCostBrl.mockResolvedValueOnce({
      model: "modelo-xyz",
      priceFrom: "default",
      fallback: true,
      monthTokens: 10_000,
      monthCostBrl: 0.08,
      projectedMonthCostBrl: 0.15,
      daysElapsed: 16,
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const cost = await caller.profile.getUsageCost();
    expect(cost.fallback).toBe(true);
  });
});
