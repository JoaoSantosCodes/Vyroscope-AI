import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-disable @typescript-eslint/no-unused-vars */
// Padrão do projeto (limits.test.ts): vi.mock antes dos imports do módulo, e as
// funções internas do db.ts não são interceptáveis — a lógica pura
// (projectExhaustion) é exportada e testada diretamente.
vi.mock("./db", () => ({
  getUsageBudgets: vi.fn(),
  confirmLimitOverride: vi.fn(),
  recordBlockedAttempt: vi.fn(),
  confirmBlockedAttempt: vi.fn(),
  getBlockedAttempts: vi.fn(),
  checkAnalysisLimits: vi.fn(),
  projectExhaustion: vi.fn(),
  setUserLimits: vi.fn().mockResolvedValue(undefined),
}));
import { projectExhaustion, confirmLimitOverride, recordBlockedAttempt, confirmBlockedAttempt, getBlockedAttempts, setUserLimits } from "./db";

const TODAY = "2026-08-16";

// projectExhaustion é lógica pura (sem banco) — importamos a real via
// vi.importActual e a chamamos diretamente nos testes abaixo.
const dbReal = await vi.importActual<typeof import("./db")>("./db");
const projectExhaustionReal = dbReal.projectExhaustion;

describe("(Rodada 37) projectExhaustion — projeção de esgotamento de limite", () => {
  it("ilimitado (cap 0) nunca projeta esgotamento", () => {
    const proj = projectExhaustionReal({ consumed: 400_000, cap: 0, windowStartIso: "2026-08-10", todayIso: TODAY });
    expect(proj).toEqual({ exhausted: false, estimatedDayIso: null, daysLeft: null, pct: 0 });
  });

  it("ritmo médio zero não projeta nada", () => {
    const proj = projectExhaustionReal({ consumed: 0, cap: 100_000, windowStartIso: "2026-08-10", todayIso: TODAY });
    expect(proj.estimatedDayIso).toBeNull();
  });

  it("limite já atingido marca exhausted no dia atual", () => {
    const proj = projectExhaustionReal({ consumed: 100_000, cap: 100_000, windowStartIso: "2026-08-10", todayIso: TODAY });
    expect(proj.exhausted).toBe(true);
    expect(proj.estimatedDayIso).toBe(TODAY);
    expect(proj.daysLeft).toBe(0);
    expect(proj.pct).toBe(100);
  });

  it("projeta o dia estimado pelo ritmo médio diário (ritmo alto → logo)", () => {
    // 7 dias de janela, 50.000 consumidos → média ~7.142/dia; 100.000 de cap.
    const proj = projectExhaustionReal({ consumed: 50_000, cap: 100_000, windowStartIso: "2026-08-10", todayIso: TODAY });
    expect(proj.exhausted).toBe(false);
    expect(proj.estimatedDayIso).toBeTruthy();
    expect(proj.daysLeft).toBeGreaterThanOrEqual(0);
    // ~50.000 restantes / 7.142/dia ≈ 7 dias → daysLeftRaw = ceil(7)-1 = 6
    expect(proj.daysLeft).toBe(6);
    expect(proj.pct).toBe(50);
  });

  it("projeção com pouco ritmo restante empurra o dia estimado para frente", () => {
    const proj = projectExhaustionReal({ consumed: 10_000, cap: 100_000, windowStartIso: "2026-08-10", todayIso: TODAY });
    expect(proj.pct).toBe(10);
    expect(proj.daysLeft).toBeGreaterThan(6);
  });
});

describe("(Rodada 37) confirmLimitOverride / registro de tentativas bloqueadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("confirmLimitOverride devolve o overrideUntil esperado e o repassa", async () => {
    const until = Date.now() + 6 * 3600_000;
    vi.mocked(confirmLimitOverride).mockResolvedValue({ overrideUntil: until });
    const res = await confirmLimitOverride(5);
    expect(res.overrideUntil).toBe(until);
    expect(vi.mocked(confirmLimitOverride)).toHaveBeenCalledWith(5);
  });

  it("recordBlockedAttempt persiste a tentativa com dimensão, limite, consumo e motivo", async () => {
    await recordBlockedAttempt({
      userId: 5,
      dimension: "tokens",
      limitValue: 10000,
      currentUsage: 10200,
      reason: "Limite diário de tokens atingido.",
      niche: "fitness",
      analysisId: "an_123",
    });
    expect(vi.mocked(recordBlockedAttempt)).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 5,
        dimension: "tokens",
        limitValue: 10000,
        currentUsage: 10200,
        niche: "fitness",
        analysisId: "an_123",
      })
    );
  });

  it("confirmBlockedAttempt marca a tentativa como confirmada manualmente (patch com confirmedAt)", async () => {
    const now = Date.now();
    await confirmBlockedAttempt(77, { confirmedAt: now, analysisId: "an_77" });
    expect(vi.mocked(confirmBlockedAttempt)).toHaveBeenCalledWith(77, { confirmedAt: now, analysisId: "an_77" });
  });

  it("getBlockedAttempts lista as últimas tentativas do usuário", async () => {
    const rows = [
      {
        id: 1,
        dimension: "quota",
        limitValue: 500,
        currentUsage: 500,
        reason: "cota",
        attemptedAt: Date.now(),
        niche: null,
        confirmedAt: null,
        analysisId: null,
      },
    ];
    vi.mocked(getBlockedAttempts).mockResolvedValue(rows);
    const res = await getBlockedAttempts(5);
    expect(res).toHaveLength(1);
    expect(res[0].dimension).toBe("quota");
    expect(res[0].confirmedAt).toBeNull();
    expect(vi.mocked(getBlockedAttempts)).toHaveBeenCalledOnce();
  });
});

describe("(Rodada 37) setLimits estendido — persiste modo e orçamentos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persiste limitAction (block/warn) junto com os limites diários", async () => {
    await setUserLimits(5, {
      dailyAnalysisLimit: 3,
      dailyTokenLimit: 10000,
      dailyQuotaLimit: 20000,
      limitAction: "warn",
      weeklyTokenLimit: 0,
      weeklyQuotaLimit: 0,
      monthlyTokenLimit: 0,
      monthlyQuotaLimit: 0,
    });
    expect(vi.mocked(setUserLimits).mock.calls[0][1]).toMatchObject({ limitAction: "warn" });
  });

  it("persiste os orçamentos semanal e mensal (0 = ilimitado)", async () => {
    await setUserLimits(5, {
      dailyAnalysisLimit: 0,
      dailyTokenLimit: 0,
      dailyQuotaLimit: 0,
      limitAction: "block",
      weeklyTokenLimit: 2_000_000,
      weeklyQuotaLimit: 1_000_000,
      monthlyTokenLimit: 4_000_000,
      monthlyQuotaLimit: 2_000_000,
    });
    expect(vi.mocked(setUserLimits).mock.calls[0][1]).toMatchObject({
      weeklyTokenLimit: 2_000_000,
      weeklyQuotaLimit: 1_000_000,
      monthlyTokenLimit: 4_000_000,
      monthlyQuotaLimit: 2_000_000,
    });
  });
});
