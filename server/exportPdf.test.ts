import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "./analysis";
import type { ContentAgenda } from "./extended";
import { buildAgendaPdf, buildAnalysisPdf } from "./exportPdf";

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
