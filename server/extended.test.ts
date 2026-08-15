import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { analyzeNicheComparison, generateContentAgenda, generateExtendedScript } from "./extended";
import { invokeLLM } from "./_core/llm";

const mockedInvokeLLM = vi.mocked(invokeLLM);

beforeEach(() => {
  vi.clearAllMocks();
});

function suggestion(title = "Vídeo teste", score = 85) {
  return {
    title,
    hook: "Você não vai acreditar nisso",
    angle: "Ângulo único",
    narrativeStructure: "Abertura com dado forte. Desenvolvimento com exemplo. Fechamento com CTA.",
    targetLength: "8-10 min",
    viralityScore: score,
    reasoning: "Padrões fortes do nicho",
  };
}

describe("generateExtendedScript", () => {
  it("throws on empty LLM response", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({ choices: [] } as never);
    await expect(generateExtendedScript("IA", suggestion(), [])).rejects.toThrow("llm_empty_response");
  });

  it("throws on invalid JSON", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "{invalid" } }],
    } as never);
    await expect(generateExtendedScript("IA", suggestion(), [])).rejects.toThrow("llm_invalid_json");
  });

  it("throws when sections array is empty", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ totalLength: "10 min", fullScript: "texto", sections: [], notes: [] }) } }],
    } as never);
    await expect(generateExtendedScript("IA", suggestion(), [])).rejects.toThrow("llm_invalid_structure");
  });

  it("returns the parsed script with the suggestion title", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              totalLength: "10 min",
              fullScript: "Lorem ".repeat(300),
              sections: [
                { heading: "Abertura (0:00–0:45)", timing: "0:00–0:45", visuals: "B-roll de tela", dialogue: "Você não vai acreditar nisso" },
                { heading: "Desenvolvimento (0:45–8:00)", timing: "0:45–8:00", visuals: "Cortes", dialogue: "Conteúdo" },
              ],
              notes: ["Capriche na thumbnail"],
            }),
          },
        },
      ],
    } as never);

    const result = await generateExtendedScript("IA", suggestion("Meu título"), []);

    expect(result.title).toBe("Meu título");
    expect(result.totalLength).toBe("10 min");
    expect(result.fullScript.length).toBeGreaterThan(100);
    expect(result.sections).toHaveLength(2);
    expect(result.notes).toHaveLength(1);
  });
});

describe("analyzeNicheComparison", () => {
  it("enriches both niches and declares a winner", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              niches: [
                {
                  niche: "inteligência artificial",
                  avgEngagementRate: 3.5,
                  totalViews: 1000000,
                  topPatterns: ["título com promessa clara", "abertura em 3 segundos"],
                  bestSuggestion: "A IA que fará isso por você",
                },
                {
                  niche: "fitness",
                  avgEngagementRate: 2.1,
                  totalViews: 600000,
                  topPatterns: ["antes e depois", "erro comum"],
                  bestSuggestion: "O erro de 90% das pessoas",
                },
              ],
              verdict: {
                winner: "inteligência artificial",
                reasons: ["Engajamento maior", "Volume de views maior", "Menos saturação"],
              },
            }),
          },
        },
      ],
    } as never);

    const videosA = [{ title: "Vídeo A1", viewCount: 500000, likeCount: 20000, commentCount: 15000 }];
    const videosB = [{ title: "Vídeo B1", viewCount: 300000, likeCount: 6000, commentCount: 4000 }];
    const result = await analyzeNicheComparison("inteligência artificial", videosA, "fitness", videosB);

    expect(result.niches).toHaveLength(2);
    expect(result.niches[0]?.totalViews).toBe(1000000);
    expect(result.verdict.winner).toBe("inteligência artificial");
    expect(result.verdict.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("throws on invalid structure", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ niches: [] }) } }],
    } as never);
    await expect(
      analyzeNicheComparison("a", [{ title: "t", viewCount: 0, likeCount: 0, commentCount: 0 }], "b", [{ title: "t", viewCount: 0, likeCount: 0, commentCount: 0 }])
    ).rejects.toThrow("llm_invalid_structure");
  });
});

describe("generateContentAgenda", () => {
  it("builds a 4-week agenda", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              strategy: "Semana forte para ganhar tração e construir autoridade.",
              items: [
                { week: 1, title: "S1", hook: "H1", targetLength: "8 min", viralityScore: 85, goal: "Retenção" },
                { week: 2, title: "S2", hook: "H2", targetLength: "6 min", viralityScore: 70, goal: "Inscritos" },
                { week: 3, title: "S3", hook: "H3", targetLength: "10 min", viralityScore: 60, goal: "Autoridade" },
                { week: 4, title: "S4", hook: "H4", targetLength: "8 min", viralityScore: 55, goal: "Comunidade" },
              ],
            }),
          },
        },
      ],
    } as never);

    const result = await generateContentAgenda("finanças", [suggestion(), suggestion()]);

    expect(result.niche).toBe("finanças");
    expect(result.generatedAt).toBeTruthy();
    expect(result.items).toHaveLength(4);
    expect(result.strategy).toBeTruthy();
    expect(result.items.every((i) => typeof i.goal === "string")).toBe(true);
  });

  it("throws when fewer than 4 items", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({ strategy: "x", items: [{ week: 1, title: "t", hook: "h", targetLength: "5", viralityScore: 50, goal: "g" }] }),
          },
        },
      ],
    } as never);
    await expect(generateContentAgenda("moda", [suggestion()])).rejects.toThrow("llm_invalid_structure");
  });
});
