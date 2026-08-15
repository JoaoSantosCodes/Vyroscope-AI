import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "./analysis";
import { buildAnalysisPdf } from "./exportPdf";

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
