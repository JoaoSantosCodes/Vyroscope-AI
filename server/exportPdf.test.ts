import { createServer } from "http";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { AnalysisResult } from "./analysis";
import type { ContentAgenda } from "./extended";
import { buildAgendaPdf, buildAnalysisPdf } from "./exportPdf";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

let baseUrl = "";
let server: ReturnType<typeof createServer>;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === "/broken.png") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(TINY_PNG);
      });
      server.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address()!.port}`;
        resolve();
      });
    })
);

afterAll(() => new Promise<void>((resolve) => server?.close(() => resolve())));

const sampleResult: AnalysisResult = {
  niche: "fitness",
  analyzedAt: "2026-08-14T00:00:00Z",
  patterns: [
    {
      pattern: "Promessa de transformação rápida",
      explanation: "Vídeos que prometem resultado em pouco tempo performam bem.",
      evidenceVideoCount: 3,
      score: 85,
    },
  ],
  videoScores: [{ videoId: "abc123", viralityScore: 78 }],
  suggestions: [
    {
      title: "Como conseguir X em 7 dias",
      hook: "Você não vai acreditar no que aconteceu...",
      angle: "Abordagem nova",
      narrativeStructure: "Abertura. Desenvolvimento. Fechamento com CTA.",
      targetLength: "8-10 min",
      viralityScore: 80,
      reasoning: "Padrão forte no nicho.",
    },
  ],
};

describe("buildAnalysisPdf", () => {
  it("gera um buffer PDF válido com capa e sugestões", async () => {
    const buffer = await buildAnalysisPdf(sampleResult, "fitness");
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    // Assinatura do PDF (%PDF)
    expect(buffer.slice(0, 5).toString("utf-8")).toContain("%PDF");
  });

  it("gera um PDF com tamanho compatível com o conteúdo (múltiplas páginas)", async () => {
    // PDF do pdfkit comprime fluxos com FlateDecode, então o texto bruto não
    // é buscável; validamos que a saída tem tamanho substancial e assinaturas.
    const single = await buildAnalysisPdf(sampleResult, "fitness");
    const five = await buildAnalysisPdf(
      {
        ...sampleResult,
        suggestions: Array.from({ length: 5 }, (_, i) => ({
          ...sampleResult.suggestions[0],
          title: `Título ${i + 1} bem mais longo para cobrir várias linhas do card gerado`,
        })),
      },
      "fitness"
    );
    expect(five.length).toBeGreaterThan(single.length);
    expect(five.slice(0, 5).toString("utf-8")).toContain("%PDF");
    // Cada análise cria pelo menos uma capa + uma página de sugestões
    expect(single.toString("latin1").split("/Type /Page").length).toBeGreaterThan(2);
  });
});

const sampleAgenda: ContentAgenda = {
  niche: "finanças",
  generatedAt: "2026-08-15T00:00:00Z",
  strategy: "Plano de 4 semanas para crescer o canal no nicho de finanças.",
  items: [
    { week: 1, title: "Como economizar com pouco", hook: "Pare de perder dinheiro", targetLength: "8 min", viralityScore: 85, goal: "Retenção" },
    { week: 2, title: "Investindo o primeiro mil", hook: "1000 reais valem muito", targetLength: "10 min", viralityScore: 80, goal: "Autoridade" },
    { week: 3, title: "3 erros financeiros", hook: "Você comete um deles", targetLength: "6 min", viralityScore: 75, goal: "Inscritos" },
    { week: 4, title: "Plano mensal completo", hook: "O método dos 3 potes", targetLength: "12 min", viralityScore: 70, goal: "Comunidade" },
  ],
};

describe("buildAgendaPdf", () => {
  it("gera um buffer PDF válido com a estratégia e as 4 semanas", async () => {
    const buffer = await buildAgendaPdf(sampleAgenda);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 5).toString("utf-8")).toContain("%PDF");
  });
});

import { buildFavoritesPdf, type FavoritesExportRow } from "./exportPdf";

const sampleFavoritesRows: FavoritesExportRow[] = [
  {
    folder: { id: null, name: null, color: null },
    thumbnails: [
      {
        id: 1,
        imageUrl: `${baseUrl}/img.png`,
        suggestionTitle: "Thumbnail raiz",
        niche: "fitness",
        sortOrder: null,
        createdAt: new Date("2026-08-14T00:00:00Z"),
      },
    ],
  },
  {
    folder: { id: 7, name: "Canal principal", color: "#f59e0b" },
    thumbnails: [
      {
        id: 2,
        imageUrl: `${baseUrl}/img.png`,
        suggestionTitle: "Vídeo reordenado número um",
        niche: "fitness",
        sortOrder: 1,
        createdAt: new Date("2026-08-14T00:00:00Z"),
      },
      {
        id: 3,
        imageUrl: `${baseUrl}/img.png`,
        suggestionTitle: "Vídeo reordenado número dois",
        niche: "fitness",
        sortOrder: 2,
        createdAt: new Date("2026-08-14T00:00:00Z"),
      },
    ],
  },
];

describe("buildFavoritesPdf", () => {
  it("gera um buffer PDF válido com capa e seções por pasta", async () => {
    const buffer = await buildFavoritesPdf(sampleFavoritesRows);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 5).toString("utf-8")).toContain("%PDF");
  });

  it("recusa lista vazia com erro claro", async () => {
    await expect(buildFavoritesPdf([])).rejects.toThrow();
  });

  it("inclui os títulos das sugestões associadas a cada thumbnail no texto do PDF", async () => {
    const { execaSync } = await import("pdf-parse");
    const buffer = await buildFavoritesPdf(sampleFavoritesRows);
    // As classes ESM do pdf-parse 2.x quebram dentro do ambiente vitest (VerbosityLevel
    // undefined). Validar o conteúdo textual fora do vitest via o CLI executável do pacote.
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = join(tmp, "fav.pdf");
    writeFileSync(file, buffer);
    // pdf-parse 2.x é ESM e não exporta package.json; localizar cli.mjs pelo main do pacote
    const mainModule = await import("pdf-parse");
    const mainUrl = (mainModule as unknown as { __filename?: string }).__filename;
    let cli = "";
    if (mainUrl && mainUrl.endsWith("index.js")) {
      cli = mainUrl.replace(/index\.js$/, "bin/cli.mjs");
    }
    if (!cli) {
      const candidates = [
        join(import.meta.dirname!, "node_modules/pdf-parse/bin/cli.mjs"),
        join(import.meta.dirname!, "../node_modules/.pnpm/node_modules/pdf-parse/bin/cli.mjs"),
        "/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs",
      ];
      for (const c of candidates) {
        try {
          await import("node:fs/promises").then((fs) => fs.access(c));
          cli = c;
          break;
        } catch {
          /* não existe */
        }
      }
    }
    if (!cli) throw new Error("cli.mjs do pdf-parse não encontrado");
    const run = spawnSync(process.execPath, [cli, "text", file], { encoding: "utf-8", cwd: import.meta.dirname });
    const text = run.stdout + run.stderr;
    // Título da sugestão associada à thumbnail com folder
    // Validar que o CLI pdf-parse está disponível antes de depender dele
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    expect(text).toContain("Vídeo reordenado número um");
    // Thumbnails sem pasta ficam na seção raiz com seus títulos
    expect(text).toContain("Thumbnail raiz");
    // Nomes de pastas também devem constar no PDF
    // O pdfkit espaça os cabeçalhos de pasta (C A N A L P R I N C I P A L)
    expect(text.replace(/[\s ]/g, "").toUpperCase()).toContain("CANALPRINCIPAL");
  });

  it("tenta baixar as imagens e ainda gera o PDF mesmo com imagem falha", async () => {
    const broken = [
      {
        folder: { id: null, name: null, color: null },
        thumbnails: [
          {
            id: 9,
            imageUrl: `${baseUrl}/broken.png`,
            suggestionTitle: "Imagem quebrada",
            niche: "fitness",
            sortOrder: 1,
            createdAt: new Date(),
          },
        ],
      },
    ];
    const buffer = await buildFavoritesPdf(broken);
    expect(buffer.slice(0, 5).toString("utf-8")).toContain("%PDF");
  });
});

import { buildIdeaHistoryPdf, type IdeaHistoryPdfIdea } from "./exportPdf";

const samplePinned: IdeaHistoryPdfIdea[] = [
  {
    date: "2026-08-10",
    niche: "fitness",
    analysisDate: Date.parse("2026-08-05"),
    title: "Treino de 10 min",
    hook: "Acorde e treine",
    angle: "Rotina rápida",
    viralityScore: 88,
  },
];

const sampleHistoryIdeas: IdeaHistoryPdfIdea[] = [
  {
    date: "2026-08-14",
    niche: "fitness",
    analysisDate: Date.parse("2026-08-01"),
    title: "Dieta flexível",
    hook: "Coma o que gosta",
    viralityScore: 70,
  },
  {
    date: "2026-08-13",
    niche: "fitness",
    analysisDate: Date.parse("2026-08-01"),
    title: "Mobilidade antes de dormir",
    viralityScore: 45,
  },
];

describe("buildIdeaHistoryPdf", () => {
  it("gera um buffer PDF válido com capa e contagem de ideias", async () => {
    const buffer = await buildIdeaHistoryPdf({ pinned: samplePinned, ideas: sampleHistoryIdeas });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.slice(0, 5).toString("utf-8")).toContain("%PDF");
  });

  it("recusa dados vazios ou inválidos", async () => {
    await expect(buildIdeaHistoryPdf({ pinned: [], ideas: [] })).rejects.toThrow();
    await expect(buildIdeaHistoryPdf(null as never)).rejects.toThrow();
  });

  it("inclui as seções de fixadas e de rotacionadas com títulos, scores e datas no texto do PDF", async () => {
    const buffer = await buildIdeaHistoryPdf({ pinned: samplePinned, ideas: sampleHistoryIdeas });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/history.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    expect(text.replace(/[\s ]/g, "").toUpperCase()).toContain("FIXADASNOTOPO");
    expect(text.replace(/[\s ]/g, "").toUpperCase()).toContain("IDEIASROTACIONADAS");
    expect(text).toContain("Treino de 10 min");
    expect(text).toContain("Dieta flexível");
    expect(text).toContain("Mobilidade antes de dormir");
    expect(text).toContain("88/100");
    expect(text).toContain("70/100");
  });

  it("inclui as anotações e o status de cada ideia fixada no texto do PDF", async () => {
    const buffer = await buildIdeaHistoryPdf({
      pinned: [
        {
          date: "2026-08-10",
          niche: "fitness",
          analysisDate: Date.parse("2026-08-05"),
          title: "Treino de 10 min",
          hook: "Acorde e treine",
          angle: "Rotina rápida",
          viralityScore: 88,
          notes: "Rascunho sobre a rotina matinal",
          status: "gravando",
        },
      ],
      ideas: sampleHistoryIdeas,
    });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/history-notes.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("ANOTAÇÕES");
    expect(compact).toContain("RASCUNHOSOBREAROTINAMATINAL");
    expect(compact).toContain("STATUS:GRAVANDO");
  });

  it("inclui as ideias arquivadas (com status e notas) em seção dedicada do PDF", async () => {
    const buffer = await buildIdeaHistoryPdf({
      pinned: [],
      archived: [
        {
          date: "2026-08-01",
          niche: "inteligência artificial",
          analysisDate: Date.parse("2026-07-25"),
          title: "Assistente com IA",
          viralityScore: 74,
          notes: "Vídeo publicado em agosto",
          status: "publicada",
        },
      ],
      ideas: sampleHistoryIdeas,
    });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/history-archived.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("ARQUIVADAS");
    expect(compact).toContain("ASSISTENTECOMIA");
    expect(compact).toContain("STATUS:PUBLICADA");
    expect(compact).toContain("VÍDEOPUBLICADOEMAGOSTO");
    expect(compact).toContain("1ARQUIVADA");
  });

  it("rejeita entrada sem nenhuma ideia (ativas, arquivadas ou rotacionadas)", async () => {
    await expect(buildIdeaHistoryPdf({ pinned: [], archived: [], ideas: [] })).rejects.toThrow();
  });

  it("inclui o resumo de estatísticas de produção do mês no cabeçalho quando productionStats é informado", async () => {
    const buffer = await buildIdeaHistoryPdf({
      productionStats: {
        monthKey: "2026-08",
        publishedThisMonth: 3,
        avgProductionDays: 6.5,
        goal: 4,
      },
      pinned: samplePinned,
      ideas: sampleHistoryIdeas,
    });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/history-stats.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("RESUMODEPRODUÇÃO");
    expect(compact).toContain("AGOSTODE2026");
    expect(compact).toContain("3PUBLICADASNOMÊS");
    expect(compact).toContain("METADE4(75%CONCLUÍDO)");
    expect(compact).toContain("6,5DIAS");
  });

  it("exibe alternativa para média de produção quando não há publicadas", async () => {
    const buffer = await buildIdeaHistoryPdf({
      productionStats: { monthKey: "2026-07", publishedThisMonth: 0, avgProductionDays: null, goal: 5 },
      pinned: samplePinned,
      ideas: sampleHistoryIdeas,
    });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/history-stats-2.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("JULHODE2026");
    expect(compact).toContain("0PUBLICADASNOMÊS");
    expect(compact).toContain("METADE5(0%CONCLUÍDO)");
    expect(compact).toContain("SEMDADOSAINDA");
  });

  it("não renderiza o bloco de resumo quando productionStats não é informado", async () => {
    const buffer = await buildIdeaHistoryPdf({ pinned: samplePinned, ideas: sampleHistoryIdeas });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/history-no-stats.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    expect(text.replace(/\s/g, "")).not.toContain("RESUMODEPRODUÇÃO");
  });
});

describe("buildMonthlyPdf (resumo de produção mensal, rodada 20)", () => {
  it("rejects empty or malformed month keys", async () => {
    const { buildMonthlyPdf } = await import("./exportPdf");
    await expect(
      buildMonthlyPdf({ monthKey: "", publishedThisMonth: 0, avgProductionDays: null, goal: 4 })
    ).rejects.toThrow("Dados inválidos");
    await expect(
      buildMonthlyPdf({ monthKey: "2026/08", publishedThisMonth: 0, avgProductionDays: null, goal: 4 } as never)
    ).rejects.toThrow("Dados inválidos");
  });
  it("renders the monthly production summary in the PDF text", async () => {
    const { buildMonthlyPdf } = await import("./exportPdf");
    const buffer = await buildMonthlyPdf({
      monthKey: "2026-08",
      publishedThisMonth: 2,
      avgProductionDays: 6.5,
      goal: 4,
      streak: 0,
      dayOfMonth: 16,
    });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/month.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("RESUMODEPRODUÇÃO");
    expect(compact).toContain("PRODUÇÃODOMÊS");
    expect(compact).toContain("AGOSTODE2026");
    expect(compact).toContain("2PUBLICADAS·METADE4(50%CONCLUÍDO)");
    expect(compact).toContain("6,5");
    expect(compact).toContain("DIA16DOMÊS");
    expect(text).toContain("comece a sequência");
  });
  it("renders the streak seal when consecutive months met the goal", async () => {
    const { buildMonthlyPdf } = await import("./exportPdf");
    const buffer = await buildMonthlyPdf({
      monthKey: "2026-08",
      publishedThisMonth: 5,
      avgProductionDays: null,
      goal: 4,
      streak: 3,
      dayOfMonth: 10,
    });
    const { spawnSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const tmp = mkdtempSync("/tmp/pdf-test-");
    const file = `${tmp}/month-streak.pdf`;
    writeFileSync(file, buffer);
    const run = spawnSync(
      process.execPath,
      ["/home/ubuntu/vyroscope-ai/node_modules/pdf-parse/bin/cli.mjs", "text", file],
      { encoding: "utf-8", cwd: "/home/ubuntu/vyroscope-ai" }
    );
    const text = run.stdout + run.stderr;
    if (run.status !== 0) throw new Error(`pdf-parse CLI falhou: ${text}`);
    const compact = text.replace(/[\s ]/g, "").toUpperCase();
    expect(compact).toContain("SELODECONSECUTIVIDADE:3MESESSEGUIDOSCOMAMETACUMPRIDA");
  });
});
