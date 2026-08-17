import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// Mock do db antes do import do módulo sob teste (inclui TODOS os helpers usados
// por buildUsagePdf — R38).
const db = vi.hoisted(() => ({
  getUsageSummary: vi.fn().mockResolvedValue({
    llm: {
      today: { tokens: 1200, units: 5, requests: 10 },
      week: { tokens: 7000, units: 30, requests: 60 },
      month: { tokens: 30000, units: 120, requests: 240 },
    },
    youtube: {
      today: { tokens: 800, units: 3, requests: 6 },
      week: { tokens: 4500, units: 20, requests: 40 },
      month: { tokens: 18000, units: 80, requests: 160 },
    },
  }),
  getUsageDailySeries: vi.fn().mockResolvedValue({
    dates: ["2026-08-01"],
    llm: [{ tokens: 500, units: 2, requests: 4 }],
    youtube: [{ tokens: 300, units: 1, requests: 2 }],
    limitByDay: [{ date: "2026-08-01", analyses: 0, tokens: 100000, quota: 10000 }],
  }),
  getUserLimits: vi.fn().mockResolvedValue({
    dailyAnalysisLimit: 5,
    dailyTokenLimit: 100000,
    dailyQuotaLimit: 10000,
    limitAction: "warn",
    weeklyTokenLimit: 500000,
    weeklyQuotaLimit: 50000,
    monthlyTokenLimit: 2000000,
    monthlyQuotaLimit: 200000,
    overrideRemaining: 0,
  }),
  getUsageBudgets: vi.fn().mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
  }),
  getBlockedAttempts: vi.fn().mockResolvedValue([
    {
      id: 1,
      dimension: "tokens",
      attemptType: "analysis" as const,
      limitValue: 100000,
      currentUsage: 102000,
      reason: "Limite diário de tokens atingido.",
      analysisId: "a1",
      attemptedAt: new Date("2026-08-14T10:00:00Z"),
      confirmedAt: null,
    },
    {
      id: 2,
      dimension: "quota",
      attemptType: "retry" as const,
      limitValue: 10000,
      currentUsage: 10000,
      reason: "Limite diário de cota atingido.",
      analysisId: "a2",
      attemptedAt: new Date("2026-08-15T08:00:00Z"),
      confirmedAt: new Date("2026-08-15T08:05:00Z"),
    },
  ]),
  projectExhaustion: vi.fn().mockReturnValue({
    estimatedDayIso: "2026-08-20",
    daysLeft: 5,
    exhausted: false,
  }),
}));
vi.mock("./db", () => db);

import { buildUsagePdf } from "./usagePdf";

function pdfText(buffer: Buffer): string {
  const { spawnSync } = require("node:child_process");
  const { writeFileSync, mkdtempSync } = require("node:fs");
  const { join } = require("node:path");
  const tmp = mkdtempSync("/tmp/pdf-test-");
  const file = join(tmp, "usage.pdf");
  writeFileSync(file, buffer);
  const run = spawnSync(
    process.execPath,
    [join(import.meta.dirname!, "../node_modules/pdf-parse/bin/cli.mjs"), "text", file],
    { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
  );
  const text = run.stdout + run.stderr;
  if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
  return text;
}

describe("buildUsagePdf (Rodada 38)", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("gera um buffer PDF válido com capa, resumo, tabela diária e bloqueios", async () => {
    const buffer = await buildUsagePdf(12, 30);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 5).toString("utf-8")).toContain("%PDF");
    // Mais de uma página: capa + resumo + seções
    expect(buffer.toString("latin1").split("/Type /Page").length).toBeGreaterThan(3);
  });

  it("chama todos os helpers de uso e limites do db", async () => {
    await buildUsagePdf(12, 30);
    expect(db.getUsageSummary).toHaveBeenCalledWith(12);
    expect(db.getUsageDailySeries).toHaveBeenCalledWith(12, 30);
    expect(db.getUserLimits).toHaveBeenCalledWith(12);
    expect(db.getUsageBudgets).toHaveBeenCalledWith(12);
    expect(db.getBlockedAttempts).toHaveBeenCalledWith(12, 100);
    expect(db.projectExhaustion).toHaveBeenCalled();
  });

  it("limita a série diária a 90 dias mesmo com pedido maior", async () => {
    await buildUsagePdf(12, 120);
    expect(db.getUsageDailySeries).toHaveBeenCalledWith(12, 90);
  });

  it("inclui os KPIs de consumo no texto do PDF", async () => {
    const buffer = await buildUsagePdf(12, 30);
    const text = pdfText(buffer);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    // Hoje: llm (1200+800) = 2000 tokens, cota (5+3) = 8
    expect(text).toContain("2.000");
    expect(text).toContain("8");
  });

  it("inclui a seção de tentativas bloqueadas com status confirmada/bloqueada", async () => {
    const buffer = await buildUsagePdf(12, 30);
    const text = pdfText(buffer);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("TENTATIVASBLOQUEADAS");
    expect(compact).toContain("CONFIRMADA");
    expect(compact).toContain("BLOQUEADA");
    expect(compact).toContain("TOKENSLLM");
    expect(compact).toContain("LIMITE:100.000");
  });

  it("informa projeção de esgotamento quando o orçamento tem limite", async () => {
    db.projectExhaustion.mockReturnValue({ estimatedDayIso: "2026-08-20", daysLeft: 5, exhausted: false });
    const buffer = await buildUsagePdf(12, 30);
    const text = pdfText(buffer);
    expect(text).toContain("2026-08-20");
  });

  it("mostra 'Limite atingido' quando a projeção indica esgotamento", async () => {
    db.projectExhaustion.mockReturnValue({ estimatedDayIso: "2026-08-15", daysLeft: 0, exhausted: true });
    const buffer = await buildUsagePdf(12, 30);
    const text = pdfText(buffer);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("LIMITEATINGIDO");
  });
});
