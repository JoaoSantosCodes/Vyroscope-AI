import { invokeLLM } from "./_core/llm";
import type { VideoItem } from "./youtube";

type LlmMessage = { role: "system" | "user"; content: string };

export type ViralityPattern = {
  pattern: string;
  explanation: string;
  evidenceVideoCount: number;
  score: number;
};

export type Suggestion = {
  title: string;
  hook: string;
  angle: string;
  narrativeStructure: string;
  targetLength: string;
  viralityScore: number;
  reasoning: string;
};

export type AnalysisResult = {
  niche: string;
  analyzedAt: string;
  patterns: ViralityPattern[];
  videoScores: { videoId: string; viralityScore: number }[];
  suggestions: Suggestion[];
};

const ANALYSIS_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "virality_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        patterns: {
          type: "array",
          description:
            "Padrões de viralidade identificados nos vídeos em alta do nicho",
          items: {
            type: "object",
            properties: {
              pattern: { type: "string", description: "Nome curto do padrão (ex: 'Revelação de segredo')", maxLength: 80 },
              explanation: { type: "string", description: "Explicação detalhada de por que esse padrão funciona no nicho", maxLength: 300 },
              evidenceVideoCount: { type: "integer", description: "Quantos dos vídeos analisados exibem esse padrão" },
              score: { type: "integer", description: "Força do padrão de 0 a 100", minimum: 0, maximum: 100 },
            },
            required: ["pattern", "explanation", "evidenceVideoCount", "score"],
            additionalProperties: false,
          },
        },
        videoScores: {
          type: "array",
          description: "Virality score de cada vídeo analisado",
          items: {
            type: "object",
            properties: {
              videoId: { type: "string", description: "ID do vídeo do YouTube" },
              viralityScore: { type: "integer", description: "Probabilidade de viralização de 0 a 100, considerando views, engajamento relativo, título e recência", minimum: 0, maximum: 100 },
            },
            required: ["videoId", "viralityScore"],
            additionalProperties: false,
          },
        },
        suggestions: {
          type: "array",
          description:
            "5 sugestões completas de vídeo prontas para gravar, baseadas nos padrões identificados",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título pronto do vídeo, com palavras de alta conversão e gatilhos de curiosidade", maxLength: 120 },
              hook: { type: "string", description: "Hook de abertura pronto para os primeiros 5 segundos do vídeo", maxLength: 200 },
              angle: { type: "string", description: "Ângulo/abordagem única que diferencia este vídeo do que já existe", maxLength: 200 },
              narrativeStructure: { type: "string", description: "Estrutura narrativa sugerida em 3 passos (abertura, desenvolvimento, fechamento/CTA)", maxLength: 400 },
              targetLength: { type: "string", description: "Duração alvo ideal (ex: '8-12 min')" },
              viralityScore: { type: "integer", description: "Probabilidade de viralização de 0 a 100", minimum: 0, maximum: 100 },
              reasoning: { type: "string", description: "Justificativa curta do score baseada nos padrões encontrados", maxLength: 200 },
            },
            required: ["title", "hook", "angle", "narrativeStructure", "targetLength", "viralityScore", "reasoning"],
            additionalProperties: false,
          },
        },
      },
      required: ["patterns", "videoScores", "suggestions"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Analisa os vídeos em alta do nicho com LLM e produz padrões de viralidade,
 * scores por vídeo e 5 sugestões prontas para gravar.
 */
export async function analyzeNiche(
  niche: string,
  videos: VideoItem[],
  configs?: {
    llmConfig?: { apiUrl: string; apiKey: string | undefined; model?: string };
    imageConfig?: { apiUrl: string; apiKey: string | undefined; model?: string };
  }
): Promise<AnalysisResult> {
  const videoBlocks = videos
    .map((v, i) => {
      return [
        `${i + 1}. "${v.title}" (${v.channelTitle ?? "canal desconhecido"})`,
        `   Views: ${v.viewCount ?? 0} | Likes: ${v.likeCount ?? 0} | Comments: ${v.commentCount ?? 0}`,
        v.publishedAt ? `   Publicado: ${v.publishedAt}` : null,
        v.durationSeconds
          ? `   Duração: ${Math.floor(v.durationSeconds / 60)}min${v.durationSeconds % 60 > 0 ? ` ${v.durationSeconds % 60}s` : ""}`
          : null,
        v.description ? `   Descrição: ${v.description.slice(0, 400)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `Você é um estrategista sênior de viralidade para YouTube. Sua missão é analisar vídeos que estão performando acima da média em um nicho, extrair os padrões reais por trás do desempenho e produzir sugestões de vídeo prontas para gravar — sem rodeios, sem edição adicional necessária. Escreva sempre em português brasileiro. Responda apenas com o JSON solicitado.`,
    },
    {
      role: "user",
      content: `Analise os seguintes vídeos em alta no nicho "${niche}".\n\n${videoBlocks}\n\nInstruções:\n1. Identifique 4-6 padrões de viralidade reais presentes nos títulos, temas e métricas desses vídeos (ex: gatilho de curiosidade, promessa de transformação rápida, quebra de mito, storytelling pessoal, formato listicle, controvérsia leve, etc.).\n2. Para cada vídeo, atribua um viralityScore (0-100) considerando: magnitude de views relativa ao nicho, taxa de engajamento (likes+comments)/views, recência da publicação e força do título.\n3. Gere exatamente 5 sugestões de vídeo completamente novas, prontas para gravar, cada uma combinando um ou mais padrões identificados com um ângulo ainda não explorado nos vídeos analisados. Os títulos devem ser chamativos mas não sensacionalistas falsos. O hook deve ser literalmente o que o criador fala nos primeiros 5 segundos. O viralityScore da sugestão deve considerar saturação do tema e potencial de alcance.\n\nResponda em português brasileiro com o JSON estruturado.`,
    },
  ];

  const response = await invokeLLM(
    {
      messages,
      response_format: ANALYSIS_SCHEMA,
    },
    configs?.llmConfig
  );

  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    throw new Error("llm_empty_response");
  }

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(raw) as AnalysisResult;
  } catch {
    throw new Error("llm_invalid_json");
  }

  if (!Array.isArray(parsed.patterns) || !Array.isArray(parsed.suggestions)) {
    throw new Error("llm_invalid_structure");
  }

  parsed.niche = niche;
  parsed.analyzedAt = new Date().toISOString();
  return parsed;
}
