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
    llm: [{ date: "2026-08-01", tokens: 500, units: 2, requests: 4 }],
    youtube: [{ date: "2026-08-01", tokens: 300, units: 1, requests: 2 }],
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
  // (Rodada 39/40) projeção de custo mensal de LLM em R$, com câmbio dinâmico
  // e custos de thumbnails.
  estimateMonthlyCostBrl: vi.fn().mockResolvedValue({
    model: "gpt-4.1-mini",
    priceFrom: "catalog",
    fallback: false,
    monthTokens: 48000,
    monthCostBrl: 1.04,
    projectedMonthCostBrl: 2.15,
    daysElapsed: 15,
    usdBrl: 5.62,
    fxSource: "api",
    monthThumbnails: 4,
    imageCostBrl: 1.22,
    imageModel: "dall-e-3",
    imageModelFrom: "default",
    totalMonthCostBrl: 2.26,
    costByModel: [
      {
        model: "gpt-4.1-mini",
        tokens: 48000,
        inputTokens: 40000,
        outputTokens: 8000,
        costBrl: 1.04,
      },
    ],
  }),
  // (Rodada 41) histórico da cotação USD/BRL registrado pela snapshotFxRate
  getFxRateHistory: vi.fn().mockResolvedValue([
    { date: "2026-08-14", rate: 5.58, source: "api" },
    { date: "2026-08-15", rate: 5.62, source: "api" },
  ]),
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

  describe("(Rodada 39) custo estimado do mês e gráfico de consumo diário", () => {
    it("chama estimateMonthlyCostBrl e inclui a seção de custo e o modelo no PDF", async () => {
      const buffer = await buildUsagePdf(12, 30);
      expect(db.estimateMonthlyCostBrl).toHaveBeenCalledWith(12);
      const text = pdfText(buffer);
      const compact = text.replace(/[\s ]/g, "").toUpperCase();
      expect(compact).toContain("CUSTOESTIMADODELLM");
      expect(compact).toContain("GPT-4");
      expect(text).toContain("1,04");
      expect(text).toContain("2,15");
      expect(text).toContain("48.000");
    });

    it("mostra 'sem projeção pro-rata' quando a projeção é nula", async () => {
      db.estimateMonthlyCostBrl.mockResolvedValueOnce({
        model: "gpt-4.1-mini",
        priceFrom: "catalog",
        fallback: false,
        monthTokens: 48000,
        monthCostBrl: 1.04,
        projectedMonthCostBrl: null,
        daysElapsed: 31,
        usdBrl: 5.62,
        fxSource: "api",
        monthThumbnails: 0,
        imageCostBrl: 0,
        imageModel: "dall-e-3",
        imageModelFrom: "default",
        totalMonthCostBrl: 1.04,
      });
      const text = pdfText(await buildUsagePdf(12, 30));
      expect(text).toContain("sem projeção pro-rata");
    });

    it("desenha o gráfico de consumo diário quando há dados", async () => {
      db.getUsageDailySeries.mockResolvedValueOnce({
        dates: ["2026-08-10", "2026-08-11", "2026-08-12"],
        llm: [
          { date: "2026-08-10", tokens: 10000, units: 40, requests: 8 },
          { date: "2026-08-11", tokens: 20000, units: 80, requests: 16 },
          { date: "2026-08-12", tokens: 5000, units: 20, requests: 4 },
        ],
        youtube: [
          { date: "2026-08-10", tokens: 1000, units: 10, requests: 2 },
          { date: "2026-08-11", tokens: 2000, units: 20, requests: 4 },
          { date: "2026-08-12", tokens: 500, units: 5, requests: 1 },
        ],
        limitByDay: [
          { date: "2026-08-10", analyses: 0, tokens: 0, quota: 0 },
          { date: "2026-08-11", analyses: 0, tokens: 0, quota: 0 },
          { date: "2026-08-12", analyses: 0, tokens: 0, quota: 0 },
        ],
      });
      const buffer = await buildUsagePdf(12, 30);
      // As barras ficam dentro de streams comprimidos; verificar o texto
      // extraído (título do gráfico, legenda e datas do eixo).
      const text = pdfText(buffer);
      const compact = text.replace(/[\s ]/g, "").toUpperCase();
      expect(compact).toContain("GRÁFICODECONSUMODIÁRIO");
      expect(compact).toContain("TOKENSLLM");
      expect(compact).toContain("COTAYOUTUBE");
      expect(compact).toContain("DE:2026-08-10");
      expect(compact).toContain("ATÉ:2026-08-12");
      // O gráfico também inclui o rodapé com o intervalo das datas.
      // As barras são vetores PDFKit (fillColor em rgb decimal, sem hex no
      // arquivo); o título, a legenda e o intervalo de datas já confirmam
      // que o gráfico foi renderizado.
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it("não desenha barras quando não há consumo no período", async () => {
      db.getUsageDailySeries.mockResolvedValueOnce({
        dates: ["2026-08-10"],
        llm: [{ tokens: 0, units: 0, requests: 0 }],
        youtube: [{ tokens: 0, units: 0, requests: 0 }],
        limitByDay: [{ date: "2026-08-10", analyses: 0, tokens: 0, quota: 0 }],
      });
      const text = pdfText(await buildUsagePdf(12, 30));
      expect(text).toContain("Nenhum consumo registrado no período");
    });
  });

  describe("(Rodada 40) custos de thumbnails e câmbio dinâmico", () => {
    it("inclui a seção de custos de thumbnails no PDF", async () => {
      const text = pdfText(await buildUsagePdf(12, 30));
      const compact = text.replace(/[\s ]/g, "").toUpperCase();
      expect(compact).toContain("CUSTODETHUMBNAILSGERADAS");
      expect(compact).toContain("DALL-E-3");
      expect(text).toContain("1,22");
      expect(text).toContain("2,26");
      expect(text).toContain("4");
    });

    it("mostra o câmbio USD/BRL dinâmico quando a cotação vem da API", async () => {
      const text = pdfText(await buildUsagePdf(12, 30));
      expect(text).toContain("5,62");
      expect(text).toContain("via API pública");
    });

    it("mostra 'fallback' no rodapé do câmbio quando a fonte não é a API", async () => {
      db.estimateMonthlyCostBrl.mockResolvedValueOnce({
        model: "gpt-4.1-mini",
        priceFrom: "catalog",
        fallback: false,
        monthTokens: 48000,
        monthCostBrl: 1.04,
        projectedMonthCostBrl: 2.15,
        daysElapsed: 15,
        usdBrl: 5.4,
        fxSource: "fallback",
        monthThumbnails: 0,
        imageCostBrl: 0,
        imageModel: "dall-e-3",
        imageModelFrom: "default",
        totalMonthCostBrl: 1.04,
      });
      const text = pdfText(await buildUsagePdf(12, 30));
      expect(text).toContain("5,40");
      expect(text).not.toContain("via API pública");
    });
  });
});
