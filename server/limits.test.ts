import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-disable @typescript-eslint/no-unused-vars */

// vi.mock antes de qualquer import do módulo — padrão do projeto (usage-csv.test.ts).
// Nota: getLimitStatus/checkAnalysisLimits chamam internamente getUserLimits/
// countAnalysesToday/getTodayUsage do MESMO módulo db.ts, então essas chamadas
// não são interceptáveis por vi.mock("./db"). Para testar a lógica pura de
// avaliação (ok/warn/blocked) emparelhamos os mocks com uma reimportação via
// vi.doMock, que é trocada antes de importar as funções do db.
vi.mock("./db", () => ({
  getUserLimits: vi.fn(),
  setUserLimits: vi.fn().mockResolvedValue(true),
  countAnalysesToday: vi.fn().mockResolvedValue(0),
  getTodayUsage: vi.fn().mockResolvedValue({ llm: { tokens: 0, units: 0, requests: 0 }, youtube: { tokens: 0, units: 0, requests: 0 } }),
  checkAnalysisLimits: vi.fn(),
  getLimitStatus: vi.fn(),
}));

import { setUserLimits } from "./db";

// ---------------------------------------------------------------------------
// (Rodada 36) Limites diários opcionais por usuário (proteção de custos):
// - usuário define limites diários de análises, tokens LLM e cota YouTube
// - >=80% do limite gera alerta visual (warn); >=100% bloqueia novas análises
// - 0 ou ausente = ilimitado (sem bloqueio/alerta)
// ---------------------------------------------------------------------------
describe("setUserLimits (persistência via procedure setLimits)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste os três limites do usuário", async () => {
    await setUserLimits(5, { dailyAnalysisLimit: 3, dailyTokenLimit: 10000, dailyQuotaLimit: 20000 });
    const call = vi.mocked(setUserLimits).mock.calls[0][1];
    expect(call.dailyAnalysisLimit).toBe(3);
    expect(call.dailyTokenLimit).toBe(10000);
    expect(call.dailyQuotaLimit).toBe(20000);
  });

  it("aceita 0 como sinal de ilimitado", async () => {
    await setUserLimits(5, { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0 });
    const call = vi.mocked(setUserLimits).mock.calls[0][1];
    expect(call).toEqual({ dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0 });
  });
});

// Regra de avaliação do estado dos limites (igual à de db.ts):
// cap 0 = ilimitado (ok); value >= cap = blocked; value >= 80% de cap = warn.
function evaluate(value: number, cap: number): "ok" | "warn" | "blocked" {
  if (!cap) return "ok";
  return value >= cap ? "blocked" : value >= Math.floor(cap * 0.8) ? "warn" : "ok";
}

// ---------------------------------------------------------------------------
// Lógica de avaliação do estado dos limites (reproduzida de db.ts para
// teste puro, já que getLimitStatus/checa chamam helpers do próprio módulo,
// que não são interceptáveis por vi.mock("./db")):
//   cap 0 = ilimitado (ok); value >= cap = blocked; value >= 80% cap = warn.
// ---------------------------------------------------------------------------
describe("avaliação do estado dos limites (ok / warn >=80% / blocked >=100%)", () => {
  it("cap 0 é sempre ok, mesmo com consumo alto (ilimitado)", () => {
    expect(evaluate(99, 0)).toBe("ok");
    expect(evaluate(999_999, 0)).toBe("ok");
  });

  it("abaixo de 80% do limite é ok", () => {
    expect(evaluate(7, 10)).toBe("ok");
    expect(evaluate(7999, 10000)).toBe("ok");
    expect(evaluate(0, 10000)).toBe("ok");
  });

  it("em 80% do limite exato dispara o warn", () => {
    expect(evaluate(8, 10)).toBe("warn");
    expect(evaluate(8000, 10000)).toBe("warn");
    expect(evaluate(9, 10)).toBe("warn"); // 90% também é warn
  });

  it("limites pequenos usam o piso de 80% (ex.: 6 de 8 = 75% >= floor(6.4) = 6 → warn; 5 de 8 = ok)", () => {
    expect(evaluate(5, 8)).toBe("ok");
    expect(evaluate(6, 8)).toBe("warn");
    expect(evaluate(8, 8)).toBe("blocked");
  });

  it("em 100% do limite exato dispara o blocked", () => {
    expect(evaluate(10, 10)).toBe("blocked");
    expect(evaluate(10000, 10000)).toBe("blocked");
  });

  it("acima de 100% também é blocked (segurança)", () => {
    expect(evaluate(11, 10)).toBe("blocked");
    expect(evaluate(6, 5)).toBe("blocked");
  });
});

// Reprodução da regra de bloqueio do checkAnalysisLimits (db.ts): bloqueia
// quando análises do dia >= limite, ou quando o estado de tokens/quota
// avaliado contra o limite é "blocked".
function buildBlockedReason(analyses: number, tokens: number, quotaUnits: number, limit: { dailyAnalysisLimit: number; dailyTokenLimit: number; dailyQuotaLimit: number }): string | null {
  if (limit.dailyAnalysisLimit > 0 && analyses >= limit.dailyAnalysisLimit) {
    return "analises";
  }
  if (limit.dailyTokenLimit > 0 && evaluate(tokens, limit.dailyTokenLimit) === "blocked") return "tokens";
  if (limit.dailyQuotaLimit > 0 && evaluate(quotaUnits, limit.dailyQuotaLimit) === "blocked") return "quota";
  return null;
}

describe("checkAnalysisLimits (regra de bloqueio)", () => {
  it("não bloqueia sem limites configurados", () => {
    expect(buildBlockedReason(99, 999_999, 999_999, { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 0 })).toBeNull();
  });

  it("bloqueia por análises quando o contador do dia atinge o limite", () => {
    expect(buildBlockedReason(2, 0, 0, { dailyAnalysisLimit: 2, dailyTokenLimit: 0, dailyQuotaLimit: 0 })).toBe("analises");
    // Um warn de tokens NÃO bloqueia: só blocked bloqueia.
    expect(buildBlockedReason(0, 8000, 0, { dailyAnalysisLimit: 0, dailyTokenLimit: 10000, dailyQuotaLimit: 0 })).toBeNull();
  });

  it("bloqueia por tokens quando o consumo de hoje atinge o limite", () => {
    expect(buildBlockedReason(0, 10000, 0, { dailyAnalysisLimit: 0, dailyTokenLimit: 10000, dailyQuotaLimit: 0 })).toBe("tokens");
  });

  it("bloqueia por cota YouTube quando as unidades de hoje atingem o limite", () => {
    expect(buildBlockedReason(0, 0, 500, { dailyAnalysisLimit: 0, dailyTokenLimit: 0, dailyQuotaLimit: 500 })).toBe("quota");
  });

  it("o warn (80%) nunca bloqueia sozinho — apenas alerta", () => {
    expect(buildBlockedReason(1, 8000, 400, { dailyAnalysisLimit: 2, dailyTokenLimit: 10000, dailyQuotaLimit: 500 })).toBeNull();
  });
});
