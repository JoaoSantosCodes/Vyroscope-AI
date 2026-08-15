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
