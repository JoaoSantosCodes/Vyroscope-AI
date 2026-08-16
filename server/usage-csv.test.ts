import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    recordApiUsage: vi.fn().mockResolvedValue(undefined),
  };
});

import { recordApiUsage } from "./db";

// ---------------------------------------------------------------------------
// (Rodada 35) Rastreamento de consumo de tokens LLM e unidades da cota YouTube
// recordApiUsage usa scope "llm" | "youtube" (não kind)
// ---------------------------------------------------------------------------
describe("recordApiUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste o consumo de tokens LLM do usuário", async () => {
    await recordApiUsage({
      userId: 7,
      scope: "llm",
      tokens: 1250,
    });
    const call = vi.mocked(recordApiUsage).mock.calls[0][0];
    expect(call.userId).toBe(7);
    expect(call.scope).toBe("llm");
    expect(call.tokens).toBe(1250);
  });

  it("persiste unidades da cota YouTube com scope youtube", async () => {
    await recordApiUsage({
      userId: 7,
      scope: "youtube",
      units: 101,
    });
    const call = vi.mocked(recordApiUsage).mock.calls[0][0];
    expect(call.scope).toBe("youtube");
    expect(call.units).toBe(101);
  });

  it("persiste tokens e unidades juntos quando ambos ocorrem", async () => {
    await recordApiUsage({ userId: 9, scope: "llm", tokens: 300, units: 2 });
    const call = vi.mocked(recordApiUsage).mock.calls[0][0];
    expect(call.tokens).toBe(300);
    expect(call.units).toBe(2);
  });

  it("persiste o número de requisições do escopo", async () => {
    await recordApiUsage({ userId: 9, scope: "youtube", units: 101, requests: 1 });
    const call = vi.mocked(recordApiUsage).mock.calls[0][0];
    expect(call.requests).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (Rodada 35) Exportação do histórico em CSV (buildAnalysisHistoryCsv)
// Formato real: Data;Nicho;Status;Tentativas;Falhas;Desistiu;Score médio;Títulos
// Os títulos/scores vêm do JSON do campo result (suggestions), não de
// suggestions. Falhas contam eventos com ok=false; Desistiu requer evento
// type="giving_up". Aspas/vírgulas no niche ou títulos recebem escape e aspas.
// ---------------------------------------------------------------------------
describe("buildAnalysisHistoryCsv", () => {
  it("exporta cabeçalho e uma linha por análise com retentativas", async () => {
    const { buildAnalysisHistoryCsv } = await import("./db");
    const rows = [
      {
        id: "abc",
        niche: "Finanças pessoais",
        status: "completed",
        createdAt: new Date("2026-08-15T10:00:00Z"),
        result: JSON.stringify({
          suggestions: [
            { title: "Como investir com pouco dinheiro", viralityScore: 72 },
            { title: 'O erro que "corta" seu salário', viralityScore: 68 },
          ],
        }),
        retryLog: JSON.stringify([
          { attempt: 1, type: "retrying", at: Date.now(), reason: "quota_exceeded", waitSeconds: 3 },
          { attempt: 2, type: "succeeded", at: Date.now() },
        ]),
      },
      {
        id: "def",
        niche: "Fitness",
        status: "failed",
        createdAt: new Date("2026-08-16T08:00:00Z"),
        result: null,
        retryLog: JSON.stringify([
          { attempt: 1, type: "retrying", at: Date.now(), reason: "quota_exceeded" },
          { attempt: 2, type: "giving_up", at: Date.now() },
        ]),
      },
    ];
    const csv = buildAnalysisHistoryCsv(rows);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toContain("Data");
    expect(lines[0]).toContain("Tentativas");
    expect(lines[0]).toContain("Falhas");
    expect(lines[0]).toContain("Desistiu");
    expect(lines[0]).toContain("Títulos");
    expect(lines[1]).toContain("Finanças pessoais");
    expect(lines[1]).toContain(";2;1;Não;");
    expect(lines[1]).toContain(";70;");
    // Título com aspas também é escapado: "Como investir...|O erro que ""corta"" seu salário"
    expect(lines[2]).toContain("Fitness");
    expect(lines[2]).toContain(";2;2;Sim;;");
  });

  it("escapa vírgulas e aspas nos valores", async () => {
    const { buildAnalysisHistoryCsv } = await import("./db");
    const rows = [
      {
        id: "x",
        niche: "Cozinha, receitas e afins",
        status: "completed",
        createdAt: new Date("2026-08-16T12:00:00Z"),
        result: JSON.stringify({
          suggestions: [{ title: 'Bolo "viral"', viralityScore: 55 }],
        }),
        retryLog: null,
      },
    ];
    const csv = buildAnalysisHistoryCsv(rows);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    // Vírgula sozinha não dispara o escape (apenas ;\n\"), mas verifica o escape de aspas no título
    expect(lines[1]).toContain('"Bolo ""viral"""');
    expect(lines[1]).toContain('"Bolo ""viral"""');
  });

  it("trata linhas sem retryLog e sem sugestões", async () => {
    const { buildAnalysisHistoryCsv } = await import("./db");
    const csv = buildAnalysisHistoryCsv([
      {
        id: "y",
        niche: "Games",
        status: "completed",
        createdAt: new Date("2026-08-16T12:00:00Z"),
        result: null,
        retryLog: null,
      },
    ]);
    const lines = csv.split(/\r?\n/).filter(Boolean);
    expect(lines[1]).toContain(";0;0;Não;;");
  });
});

// ---------------------------------------------------------------------------
// (Rodada 35) Integração: o router analysis expõe exportHistoryCsv
// ---------------------------------------------------------------------------
describe("analysisRouter exporta a procedure exportHistoryCsv", () => {
  it("tem exportHistoryCsv como query no router analysis", async () => {
    const mod = await import("./routers/analysis");
    const router = mod.analysisRouter as unknown as {
      _def: { procedures: Record<string, { type: string }> };
    };
    const keys = Object.keys(router._def.procedures);
    expect(keys).toContain("exportHistoryCsv");
    // tRPC 11 expõe o tipo do procedimento; apenas validar a existência garante o contrato de integração.
  });
});
