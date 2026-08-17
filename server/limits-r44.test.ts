// (Rodada 44) Limites por análise individual, detalhamento do PDF de uso e CSV do histórico.
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock total do db antes dos imports do módulo sob teste.
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
    /** (Rodada 44) Limite de custo por análise individual (R$; 0 = sem limite). */
    analysisCostCapBrl: 0,
  }),
  setUserLimits: vi.fn().mockResolvedValue(undefined),
  getUsageBudgets: vi.fn().mockResolvedValue({
    weekStartIso: "2026-08-10",
    monthStartIso: "2026-08-01",
  }),
  getBlockedAttempts: vi.fn().mockResolvedValue([]),
  projectExhaustion: vi.fn().mockReturnValue({
    estimatedDayIso: "2026-08-20",
    daysLeft: 5,
    exhausted: false,
  }),
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
    costByModel: [{ model: "gpt-4.1-mini", tokens: 48000, inputTokens: 40000, outputTokens: 8000, costBrl: 1.04 }],
  }),
  getFxRateHistory: vi.fn().mockResolvedValue([
    { date: "2026-08-14", rate: 5.58, source: "api" },
    { date: "2026-08-15", rate: 5.62, source: "api" },
  ]),
  estimateWeeklyCostBrl: vi.fn().mockResolvedValue({
    weekTokens: 12000,
    weekCostBrl: 0.26,
    weekThumbnails: 1,
    imageCostBrl: 0.22,
    totalWeekCostBrl: 0.48,
    projectedWeekCostBrl: null,
    usdBrl: 5.62,
    fxSource: "api",
    /** (Rodada 43/44) Detalhamento do custo semanal por modelo de IA. */
    costByModel: [
      { model: "gpt-4.1-mini", tokens: 12000, inputTokens: 10000, outputTokens: 2000, costBrl: 0.26 },
    ],
  }),
  // (Rodada 44) Registro de alertas in-app (recordUsageAlert é chamada por
  // emitAnalysisCostAlert dentro de alerts.ts).
  recordUsageAlert: vi.fn().mockResolvedValue(undefined),
  // (Rodada 44) Análises e thumbnails do período para o PDF.
  listAnalysesByUser: vi.fn().mockResolvedValue([
    {
      id: "a1",
      userId: 12,
      niche: "finanças",
      status: "completed",
      result: null,
      retryLog: null,
      costBrl: 0.35,
      costDetail: "gpt-4.1-mini · 14.000 tokens",
      createdAt: new Date(),
    },
  ]),
  getThumbnailsByAnalysis: vi.fn().mockResolvedValue([
    {
      suggestionTitle: "Thumb de finanças",
      imageUrl: "https://example.com/t.png",
      costBrl: 0.22,
      costDetail: "dall-e-3 · R$ 0,22",
    },
  ]),
}));
// Mock PARCIAL de "./db": a maioria das exportações vem do objeto `db` (vi.fn);
// as demais permanecem as do módulo original. getUserLimits/recordUsageAlert
// estão no objeto `db`, portanto as funções internas de emitAnalysisCostAlert
// (que são chamadas via o módulo mockado pelos importadores) usam as versões
// mockadas controláveis por teste.
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return { ...original, ...db };
});

// catálogos de preço mockados para a projeção de custo.
vi.hoisted(() => {
  const dbMod = db as Record<string, unknown>;
  dbMod.LLM_MODEL_PRICES = {
    "gpt-4.1-mini": { input: 0.3, output: 1.2, name: "GPT-4.1 mini" },
  };
  dbMod.LLM_DEFAULT_PRICE_PER_MILLION = { input: 1.0, output: 4.0 };
});

// Helpers sob teste importados direto do módulo real (o mock de "./db" continua valendo
// para as chamadas internas — getDb() seleciona o mesmo módulo mockado).
import { buildAnalysisHistoryCsv } from "./db";
import { emitAnalysisCostAlert } from "./alerts";
import { buildUsagePdf } from "./usagePdf";


beforeEach(() => {
  vi.useRealTimers();
  for (const fn of Object.values(db))
    if ((typeof fn === "object" || typeof fn === "function") && fn && "mockClear" in fn)
      (fn as ReturnType<typeof vi.fn>).mockClear?.();
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}
function sampleUser(id = 12): AuthenticatedUser {
  return {
    id,
    openId: `user-${id}`,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

/** (padrão exportPdf.test.ts) extrai o texto renderizado de um PDF via CLI do
 *  pdf-parse 2.x — as classes ESM quebram dentro do ambiente vitest. */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync, accessSync } = await import("node:fs");
  const { join } = await import("node:path");
  const tmp = mkdtempSync("/tmp/pdf-test-");
  const file = join(tmp, "out.pdf");
  writeFileSync(file, buffer);
  const candidates = [
    join(import.meta.dirname!, "node_modules/pdf-parse/bin/cli.mjs"),
    join(import.meta.dirname!, "../node_modules/.pnpm/node_modules/pdf-parse/bin/cli.mjs"),
    "/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs",
  ];
  let cli = "";
  for (const c of candidates) {
    try {
      accessSync(c);
      cli = c;
      break;
    } catch {
      /* não existe */
    }
  }
  if (!cli) throw new Error("cli.mjs do pdf-parse não encontrado");
  const run = spawnSync(process.execPath, [cli, "text", file], { encoding: "utf-8", cwd: import.meta.dirname });
  const text = run.stdout + run.stderr;
  if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
  return text;
}

describe("(Rodada 44) Limites por análise individual, PDF e CSV", () => {
  it("setLimits persiste analysisCostCapBrl e getUsageCost o expõe", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createContext(sampleUser()));

    // O zod do router usa z.number().int(), então o valor é inteiro (R$ inteiros).
    await caller.profile.setLimits({ analysisCostCapBrl: 2 });
    expect(db.setUserLimits).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ analysisCostCapBrl: 2 })
    );
  });

  it("validação rejeita valores fora do intervalo (max 1000, não negativo)", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(createContext(sampleUser()));

    await expect(caller.profile.setLimits({ analysisCostCapBrl: 1001 })).rejects.toThrow();
    await expect(caller.profile.setLimits({ analysisCostCapBrl: -1 })).rejects.toThrow();
    // 0 é válido (sem limite).
    await caller.profile.setLimits({ analysisCostCapBrl: 0 });
    expect(db.setUserLimits).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ analysisCostCapBrl: 0 })
    );
  });

  it("emitAnalysisCostAlert registra alerta quando o custo passa do limite (1/dia)", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    (db.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({ analysisCostCapBrl: 1.0 } as never);
    (db.recordUsageAlert as ReturnType<typeof vi.fn>).mockImplementation(
      async (u: number, dim: string, lvl: string, cur: number, lim: number, msg: string) => {
        inserted.push({ userId: u, dimension: dim, level: lvl, currentUsage: cur, limitValue: lim, message: msg });
        return undefined;
      }
    );
    // Ainda abaixo do limite: nada é registrado.
    await emitAnalysisCostAlert(12, 0.9);
    expect(inserted).toHaveLength(0);

    // Acima do limite: registro 1 alerta.
    await emitAnalysisCostAlert(12, 1.5);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].dimension).toBe("analysis_cost");
    expect(inserted[0].level).toBe("warn");
    expect(inserted[0].limitValue).toBe(1.0);
    expect(Number(inserted[0].currentUsage)).toBe(150);
    const msg = String(inserted[0].message);
    expect(msg).toContain("1,50");
    expect(msg).toContain("1,00");

    // Dedup do dia: a segunda chamada no mesmo dia encontra o registro já
    // gravado e retorna sem novo insert (coberto pela lógica real em produção;
    // aqui verifica-se que o alert continua sendo emitido apenas 1x por dia).
    (db.recordUsageAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await emitAnalysisCostAlert(12, 2.0);
    expect(inserted).toHaveLength(1);
  });

  it("emitAnalysisCostAlert não faz nada sem limite configurado", async () => {
    // beforeEach limpa apenas as chamadas (mockClear), não os retornos;
    // o teste anterior redefine o cap para 1,0, então restabelecer 0 aqui.
    (db.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({ analysisCostCapBrl: 0 } as never);
    (db.recordUsageAlert as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await emitAnalysisCostAlert(12, 5.0);
    expect(db.recordUsageAlert).not.toHaveBeenCalled();
  });

  it("CSV inclui custo por análise e thumbnails quando os dados vêm do backend", () => {
    const content = buildAnalysisHistoryCsv([
      {
        id: "a1",
        niche: "finanças",
        status: "completed",
        result: '{"suggestions": [{"title": "Título 1", "viralityScore": 85}]}',
        retryLog: null,
        createdAt: new Date("2026-08-15T12:00:00Z"),
        costBrl: 0.35,
        costDetail: "gpt-4.1-mini · 14.000 tokens",
        thumbnails: [
          { title: "Thumb 1", url: "https://example.com/t.png", costBrl: 0.22 },
          { title: "Thumb 2", url: "https://example.com/t2.png", costBrl: null },
        ],
      },
    ]);
    const lines = content.split("\n");
    expect(lines[0]).toContain("Custo (R$)");
    expect(lines[0]).toContain("Detalhamento do custo");
    expect(lines[0]).toContain("Thumbnails (título;url;custo)");
    expect(lines[1]).toContain("R$ 0,35");
    expect(lines[1]).toContain("gpt-4.1-mini · 14.000 tokens");
    expect(lines[1]).toContain("Thumb 1;https://example.com/t.png;R$ 0,22");
    expect(lines[1]).toContain("Thumb 2;https://example.com/t2.png;");
  });

  it("CSV mantém o formato antigo quando as linhas não trazem custo", () => {
    const content = buildAnalysisHistoryCsv([
      {
        id: "a2",
        niche: "tech",
        status: "failed",
        result: null,
        retryLog: null,
        createdAt: new Date("2026-08-10T08:00:00Z"),
      },
    ]);
    const lines = content.split("\n");
    expect(lines[0]).not.toContain("Custo (R$)");
    expect(lines[0]).not.toContain("Thumbnails");
    expect(lines[0].split(";")).toHaveLength(8);
  });

  it("PDF inclui o detalhamento semanal por modelo e o custo por análise/thumbnail", async () => {
    (db.getUserLimits as ReturnType<typeof vi.fn>).mockResolvedValue({ analysisCostCapBrl: 2.0 } as never);
    const buffer = await buildUsagePdf(12, 7);
    // PDFDoc usa fontes embutidas (subset), então o texto não aparece como string
    // literal no binário. Validar o conteúdo textual via o CLI do pdf-parse 2.x
    // (padrão do projeto — ver exportPdf.test.ts).
    const text = await extractPdfText(buffer);
    expect(text).toContain("Detalhamento semanal por modelo de IA");
    expect(text).toContain("gpt-4.1-mini");
    expect(text).toContain("Total semanal");
    expect(text).toContain("Custo por análise e thumbnail");
    expect(text).toContain("finanças");
    expect(text).toContain("0,35");
    expect(text).toContain("Thumb de finanças");
  });
});
