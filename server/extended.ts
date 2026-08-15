import { invokeLLM } from "./_core/llm";
import type { AnalysisResult, Suggestion, ViralityPattern } from "./analysis";

type LlmMessage = { role: "system" | "user"; content: string };

export type ScriptSection = {
  /** Rótulo da seção, ex: "Abertura (0:00–0:45)" */
  heading: string;
  /** Tempo estimado da seção */
  timing: string;
  /** O que mostrar na tela (B-roll, overlays, cortes) */
  visuals: string;
  /** Fala/roteiro propriamente dito */
  dialogue: string;
};

export type ScriptOutline = {
  title: string;
  totalLength: string;
  /** Esboço estruturado em 3 atos (abertura, desenvolvimento, fechamento) */
  acts: { act: string; label: string; duration: string; points: string[]; keyLine: string }[];
  notes: string[];
};

export type ExtendedScript = {
  title: string;
  totalLength: string;
  /** Texto corrido do roteiro em português (~1.500–3.000 palavras) */
  fullScript: string;
  sections: ScriptSection[];
  notes: string[];
};

const SCRIPT_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "extended_script",
    strict: true,
    schema: {
      type: "object",
      properties: {
        totalLength: { type: "string", description: "Duração alvo total do vídeo" },
        fullScript: {
          type: "string",
          description: "Roteiro completo do vídeo em texto corrido, em português brasileiro, com falas detalhadas para cada bloco (1.500 a 3.000 palavras)",
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "Nome da seção com tempo estimado, ex: 'Abertura (0:00–0:45)'" },
              timing: { type: "string", description: "Faixa de tempo da seção" },
              visuals: { type: "string", description: "Descrição do que aparece na tela: B-roll, cortes, overlays, gráficos" },
              dialogue: { type: "string", description: "Fala sugerida para essa seção" },
            },
            required: ["heading", "timing", "visuals", "dialogue"],
            additionalProperties: false,
          },
        },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "Notas de produção (iluminação, edição, thumbnail, CTA)",
        },
      },
      required: ["totalLength", "fullScript", "sections", "notes"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Gera um roteiro estendido (1.500–3.000 palavras) a partir de uma sugestão,
 * enriquecido com o contexto dos padrões de viralidade do nicho.
 */
export async function generateExtendedScript(
  niche: string,
  suggestion: Suggestion,
  patterns: ViralityPattern[]
): Promise<ExtendedScript> {
  const patternsText = patterns
    .map((p) => `• ${p.pattern} (score ${p.score}): ${p.explanation}`)
    .join("\n");

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `Você é um roteirista sênior de YouTube que transforma sugestões de vídeo em roteiros completos e prontos para gravar. Escreva sempre em português brasileiro, com linguagem natural de criador de conteúdo, sem clichês de marketing. Responda apenas com o JSON solicitado. O fullScript deve ter entre 1.500 e 3.000 palavras, com falas literais que o criador pode ler na gravação.`,
    },
    {
      role: "user",
      content: `Nicho: "${niche}"\n\nPadrões de viralidade identificados no nicho:\n${patternsText}\n\nSugestão escolhida:\n• Título: ${suggestion.title}\n• Hook de abertura: ${suggestion.hook}\n• Ângulo: ${suggestion.angle}\n• Estrutura narrativa: ${suggestion.narrativeStructure}\n• Duração alvo: ${suggestion.targetLength}\n• Score: ${suggestion.viralityScore}\n\nInstruções:\n1. Escreva o roteiro completo do vídeo (1.500–3.000 palavras) em fullScript, dividido em blocos com marcações [ABERTURA], [DESENVOLVIMENTO], [FECHAMENTO].\n2. Inclua falas literais (entre aspas quando for uma frase-chave), transições entre blocos e o hook de abertura adaptado ao roteiro.\n3. Em sections, divida o vídeo em 4–7 seções com timing realista, visual sugerido (B-roll, overlays, cortes) e fala resumida de cada seção.\n4. Em notes, liste 3–5 notas práticas de produção: thumbnail, edição, CTA e retenção.\n5. Aplique os padrões de viralidade do nicho ao longo do roteiro, mantendo o ângulo único da sugestão.`,
    },
  ];

  const response = await invokeLLM({ messages, response_format: SCRIPT_SCHEMA });
  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    throw new Error("llm_empty_response");
  }
  let parsed: ExtendedScript;
  try {
    parsed = JSON.parse(raw) as ExtendedScript;
  } catch {
    throw new Error("llm_invalid_json");
  }
  parsed.title = suggestion.title;
  if (!Array.isArray(parsed.sections) || !parsed.sections.length) {
    throw new Error("llm_invalid_structure");
  }
  return parsed;
}

const OUTLINE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "script_outline",
    strict: true,
    schema: {
      type: "object",
      properties: {
        totalLength: { type: "string", description: "Duração alvo total do vídeo" },
        acts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              act: { type: "string", description: "Identificador do ato, ex: 'abertura', 'desenvolvimento', 'fechamento'" },
              label: { type: "string", description: "Nome curto do ato em português, ex: 'Abertura com hook'" },
              duration: { type: "string", description: "Duração estimada do ato, ex: '0:00–0:45'" },
              points: { type: "array", items: { type: "string" }, description: "2 a 4 tópicos que devem ser cobertos neste ato" },
              keyLine: { type: "string", description: "Fala-chave literal sugerida para o ato" },
            },
            required: ["act", "label", "duration", "points", "keyLine"],
            additionalProperties: false,
          },
          minItems: 3,
          maxItems: 3,
        },
        notes: {
          type: "array",
          items: { type: "string" },
          description: "Notas de produção (thumbnail, edição, CTA, retenção)",
        },
      },
      required: ["totalLength", "acts", "notes"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Gera um esboço de roteiro compacto a partir de uma sugestão,
 * enriquecido com os padrões de viralidade do nicho.
 */
export async function generateOutline(niche: string, suggestion: Suggestion, patterns: ViralityPattern[]): Promise<ScriptOutline> {
  const patternsText = patterns.slice(0, 3).map((p) => `• ${p.pattern} (score ${p.score}): ${p.explanation}`).join("\n");
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `Você é um roteirista sênior de YouTube que transforma sugestões de vídeo em esboços de roteiro prontos para gravar. Escreva sempre em português brasileiro, com linguagem natural de criador de conteúdo, sem clichês de marketing. Responda apenas com o JSON solicitado.`,
    },
    {
      role: "user",
      content: `Nicho: "${niche}"\n\nPadrões de viralidade do nicho:\n${patternsText}\n\nSugestão escolhida:\n• Título: ${suggestion.title}\n• Hook de abertura: ${suggestion.hook}\n• Ângulo: ${suggestion.angle}\n• Estrutura narrativa: ${suggestion.narrativeStructure}\n• Duração alvo: ${suggestion.targetLength}\n• Score: ${suggestion.viralityScore}\n\nInstruções:\n1. Retorne exatamente 3 atos (abertura, desenvolvimento, fechamento), cada um com 2 a 4 tópicos concretos e uma fala-chave literal.\n2. Divida a duração alvo de forma realista entre os atos (abertura curta, ~10% do total).\n3. Aplique os padrões de viralidade do nicho e mantenha o ângulo único da sugestão.\n4. Em notes, liste 3–5 notas práticas de produção.`,
    },
  ];

  const response = await invokeLLM({ messages, response_format: OUTLINE_SCHEMA });
  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    throw new Error("llm_empty_response");
  }
  let parsed: ScriptOutline;
  try {
    parsed = JSON.parse(raw) as ScriptOutline;
  } catch {
    throw new Error("llm_invalid_json");
  }
  parsed.title = suggestion.title;
  if (!Array.isArray(parsed.acts) || parsed.acts.length < 3) {
    throw new Error("llm_invalid_structure");
  }
  return parsed;
}

export type NicheComparison = {
  niches: {
    niche: string;
    topVideo: { title: string; viewCount: number | null; likeCount: number | null; channelTitle: string | null } | null;
    avgEngagementRate: number | null;
    totalViews: number;
    avgViews: number;
      topPatterns: ViralityPattern[];
      bestSuggestion: { title: string } | null;
  }[];
  verdict: {
    winner: string;
    reasons: string[];
  };
};

const COMPARISON_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "niche_comparison",
    strict: true,
    schema: {
      type: "object",
      properties: {
        niches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              niche: { type: "string", description: "Nome do nicho" },
              avgEngagementRate: { type: "number", description: "Taxa média de engajamento (likes+comments)/views em percentual (0-100)", minimum: 0, maximum: 100 },
              totalViews: { type: "integer", description: "Soma de visualizações dos vídeos analisados" },
              topPatterns: {
                type: "array",
                items: { type: "string" },
                description: "Top 2 padrões de viralidade do nicho",
                minItems: 2,
                maxItems: 2,
              },
              bestSuggestion: { type: "string", description: "Melhor título de sugestão possível neste nicho baseado nos padrões" },
            },
            required: ["niche", "avgEngagementRate", "totalViews", "topPatterns", "bestSuggestion"],
            additionalProperties: false,
          },
          minItems: 2,
          maxItems: 2,
        },
        verdict: {
          type: "object",
          properties: {
            winner: { type: "string", description: "Nome do nicho vencedor" },
            reasons: {
              type: "array",
              items: { type: "string" },
              description: "2-3 razões objetivas da vitória",
              minItems: 2,
              maxItems: 3,
            },
          },
          required: ["winner", "reasons"],
          additionalProperties: false,
        },
      },
      required: ["niches", "verdict"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Compara dois nichos a partir de análises já existentes, produzindo um
 * veredito objetivo com base em engajamento, volume de views e padrões.
 */
export function compareNicheResults(
  a: { niche: string; result: AnalysisResult },
  b: { niche: string; result: AnalysisResult }
): NicheComparison {
  const build = (entry: { niche: string; result: AnalysisResult }) => {
    const videos = entry.result.videoScores ?? [];
    return {
      niche: entry.niche,
      topVideo: null,
      avgEngagementRate: null,
      totalViews: 0,
      avgViews: 0,
      topPatterns: entry.result.patterns.slice(0, 2),
      bestSuggestion: entry.result.suggestions.sort((x, y) => y.viralityScore - x.viralityScore)[0] ?? null,
    };
  };

  return {
    niches: [build(a), build(b)],
    verdict: {
      winner: a.niche,
      reasons: ["Análise baseada no conjunto de vídeos coletado"],
    },
  };
}

/**
 * Compara dois nichos usando o LLM com os vídeos reais de cada um.
 */
export async function analyzeNicheComparison(
  nicheA: string,
  videosA: { title: string; viewCount: number | null; likeCount: number | null; commentCount: number | null }[],
  nicheB: string,
  videosB: { title: string; viewCount: number | null; likeCount: number | null; commentCount: number | null }[]
): Promise<NicheComparison> {
  const block = (label: string, videos: typeof videosA) =>
    videos
      .map(
        (v) =>
          `• "${v.title}" — Views: ${v.viewCount ?? 0} | Likes: ${v.likeCount ?? 0} | Comments: ${v.commentCount ?? 0}`
      )
      .join("\n");

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `Você é um estrategista de YouTube especializado em escolha de nicho. Compare dois nichos com base em dados reais de vídeos em alta e indique objetivamente qual oferece mais potencial de viralização para um canal novo. Escreva em português brasileiro e responda apenas com o JSON solicitado.`,
    },
    {
      role: "user",
      content: `Compare os nichos abaixo.\n\nNicho A: "${nicheA}"\n${block("A", videosA)}\n\nNicho B: "${nicheB}"\n${block("B", videosB)}\n\nInstruções:\n1. Calcule a taxa média de engajamento (likes+comments)/views de cada nicho em percentual.\n2. Some o total de visualizações dos vídeos listados.\n3. Identifique os 2 padrões de viralidade dominantes de cada nicho.\n4. Proponha o melhor título de vídeo possível para cada nicho.\n5. Declare o nicho vencedor (em verdict.winner, com o nome exato do nicho) e 2-3 razões objetivas (engajamento, saturação, volume de views, facilidade para canal novo).`,
    },
  ];

  const response = await invokeLLM({ messages, response_format: COMPARISON_SCHEMA });
  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    throw new Error("llm_empty_response");
  }
  let parsed: NicheComparison;
  try {
    parsed = JSON.parse(raw) as NicheComparison;
  } catch {
    throw new Error("llm_invalid_json");
  }
  if (!Array.isArray(parsed.niches) || parsed.niches.length !== 2 || !parsed.verdict) {
    throw new Error("llm_invalid_structure");
  }
  return parsed;
}

export type AgendaItem = {
  week: number;
  title: string;
  hook: string;
  targetLength: string;
  viralityScore: number;
  goal: string;
};

export type ContentAgenda = {
  niche: string;
  generatedAt: string;
  items: AgendaItem[];
  strategy: string;
};

const AGENDA_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "content_agenda",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              week: { type: "integer", description: "Semana do plano (1 a 4)" },
              title: { type: "string", description: "Título do vídeo da semana" },
              hook: { type: "string", description: "Hook de abertura" },
              targetLength: { type: "string", description: "Duração alvo" },
              viralityScore: { type: "integer", description: "Score 0-100", minimum: 0, maximum: 100 },
              goal: { type: "string", description: "Objetivo estratégico do vídeo da semana (ex: retenção, conversão, autoridade)", maxLength: 150 },
            },
            required: ["week", "title", "hook", "targetLength", "viralityScore", "goal"],
            additionalProperties: false,
          },
          minItems: 4,
          maxItems: 4,
        },
        strategy: { type: "string", description: "Estratégia geral do mês em 1-2 frases" },
      },
      required: ["items", "strategy"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Transforma as sugestões de uma análise em uma agenda de conteúdo de 4
 * semanas (1 vídeo por semana), sequenciada estrategicamente.
 */
export async function generateContentAgenda(
  niche: string,
  suggestions: Suggestion[]
): Promise<ContentAgenda> {
  const suggestionsText = suggestions
    .map(
      (s, i) =>
        `${i + 1}. "${s.title}" — Hook: ${s.hook} — Score: ${s.viralityScore} — Duração: ${s.targetLength} — Ângulo: ${s.angle}`
    )
    .join("\n");

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `Você é um planejador de conteúdo de YouTube. Transforme sugestões de vídeo em um plano mensal de publicação de 1 vídeo por semana, ordenando-as estrategicamente (comece pelo vídeo com maior potencial de alcance para ganhar tração inicial, e intercale formatos). Escreva em português brasileiro e responda apenas com o JSON solicitado.`,
    },
    {
      role: "user",
      content: `Nicho: "${niche}"\n\nSugestões disponíveis:\n${suggestionsText}\n\nInstruções:\n1. Crie exatamente 4 itens (1 por semana), usando as sugestões fornecidas como base — pode refinar títulos e hooks para torná-los mais fortes.\n2. Ordene as semanas estrategicamente: semana 1 com o vídeo de maior potencial, alternando formatos nas demais.\n3. Defina um goal estratégico distinto para cada semana (retenção, conversão de inscritos, autoridade, comunidade).\n4. Em strategy, resuma a estratégia do mês em 1-2 frases.`,
    },
  ];

  const response = await invokeLLM({ messages, response_format: AGENDA_SCHEMA });
  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    throw new Error("llm_empty_response");
  }
  let parsed: ContentAgenda;
  try {
    parsed = JSON.parse(raw) as ContentAgenda;
  } catch {
    throw new Error("llm_invalid_json");
  }
  parsed.niche = niche;
  parsed.generatedAt = new Date().toISOString();
  if (!Array.isArray(parsed.items) || parsed.items.length < 4) {
    throw new Error("llm_invalid_structure");
  }
  return parsed;
}

/**
 * Constrói o prompt de imagem para uma thumbnail baseada no título da
 * sugestão e nos padrões de viralidade do nicho.
 */
export function buildThumbnailPrompt(
  niche: string,
  title: string,
  patterns: ViralityPattern[]
): string {
  const topPatterns = patterns
    .slice(0, 3)
    .map((p) => p.pattern)
    .join("; ");
  return [
    `Thumbnail de YouTube profissional e de alto contraste para o nicho "${niche}".`,
    `Título do vídeo (texto grande e legível na thumbnail, curto): "${title}"`,
    `Padrões do nicho a refletir visualmente: ${topPatterns}.`,
    `Estilo: composição impactante com rosto expressivo ou elemento central forte, cores vibrantes (fundo escuro com destaque âmbar/laranja), texto em até 4 palavras grandes, iluminação dramática de estúdio, profundidade de campo, alta nitidez, proporção 16:9.`,
    `Sem marcas d'água, sem logotipos, sem texto extra além do título.`,
  ].join("\n");
}

export type AlternativeTitle = {
  /** Título alternativo proposto */
  title: string;
  /** Score de viralidade previsto (0-100) */
  viralityScore: number;
  /** Justificativa curta de por que este título tende a performar */
  rationale: string;
};

export type AlternativeTitlesResult = {
  titles: AlternativeTitle[];
  suggestionTitle: string;
};

const ALT_TITLES_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "alternative_titles",
    strict: true,
    schema: {
      type: "object",
      properties: {
        titles: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Título alternativo do vídeo, no máximo 70 caracteres" },
              viralityScore: { type: "integer", description: "Score de viralidade previsto de 0 a 100", minimum: 0, maximum: 100 },
              rationale: { type: "string", description: "Justificativa em 1 frase de por que este título tende a performar", maxLength: 200 },
            },
            required: ["title", "viralityScore", "rationale"],
            additionalProperties: false,
          },
          minItems: 5,
          maxItems: 5,
        },
      },
      required: ["titles"],
      additionalProperties: false,
    },
  },
} as const;

/**
 * Gera 5 variações de título para uma sugestão, cada uma pontuada com um
 * score de viralidade previsto, considerando os padrões do nicho.
 */
export async function generateAlternativeTitles(
  niche: string,
  suggestion: Suggestion,
  patterns: ViralityPattern[]
): Promise<AlternativeTitlesResult> {
  const patternsText = patterns
    .slice(0, 4)
    .map((p) => `• ${p.pattern} (score ${p.score}): ${p.explanation}`)
    .join("\n");

  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `Você é um especialista em títulos de YouTube. Crie variações de título que mantenham o ângulo único da sugestão original, mas explorem gatilhos diferentes (curiosidade, urgência, especificidade numérica, contrarianismo, transformação). Escreva em português brasileiro, títulos curtos (até 70 caracteres), clicáveis mas sem clickbait enganoso. Responda apenas com o JSON solicitado.`,
    },
    {
      role: "user",
      content: `Nicho: "${niche}"\n\nPadrões de viralidade do nicho:\n${patternsText}\n\nSugestão original:\n• Título: ${suggestion.title}\n• Hook: ${suggestion.hook}\n• Ângulo: ${suggestion.angle}\n• Score original: ${suggestion.viralityScore}\n\nInstruções:\n1. Crie exatamente 5 títulos alternativos, cada um explorando um gatilho diferente (curiosidade, número específico, urgência/tempo, contrarianismo, antes/depois ou transformação).\n2. Para cada título, atribua um viralityScore de 0 a 100, calibrado de forma que títulos mais alinhados aos padrões do nicho recebam scores maiores.\n3. Em rationale, explique em 1 frase por que o título tende a performar neste nicho.`,
    },
  ];

  const response = await invokeLLM({ messages, response_format: ALT_TITLES_SCHEMA });
  const raw = response.choices[0]?.message?.content;
  if (!raw || typeof raw !== "string") {
    throw new Error("llm_empty_response");
  }
  let parsed: { titles: AlternativeTitle[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("llm_invalid_json");
  }
  if (!Array.isArray(parsed.titles) || parsed.titles.length < 5) {
    throw new Error("llm_invalid_structure");
  }
  return {
    titles: parsed.titles.map((t) => ({
      title: t.title,
      viralityScore: Math.min(100, Math.max(0, Number(t.viralityScore) || 0)),
      rationale: t.rationale,
    })),
    suggestionTitle: suggestion.title,
  };
}
