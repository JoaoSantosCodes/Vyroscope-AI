import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { analyzeNicheComparison, buildThumbnailPrompt, generateContentAgenda, generateExtendedScript, generateAlternativeTitles } from "./extended";
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

  it("includes niche, title and up to 3 patterns in the prompt", () => {
    const prompt = buildThumbnailPrompt("inteligência artificial", "5 erros com IA", [
      { pattern: "título com número", explanation: "x", evidenceVideoCount: 5, score: 90 },
      { pattern: "antes e depois", explanation: "y", evidenceVideoCount: 4, score: 80 },
      { pattern: "curiosidade", explanation: "z", evidenceVideoCount: 3, score: 70 },
      { pattern: "excesso", explanation: "w", evidenceVideoCount: 2, score: 60 },
    ]);

    expect(prompt).toContain('nicho "inteligência artificial"');
    expect(prompt).toContain('"5 erros com IA"');
    expect(prompt).toContain("título com número");
    expect(prompt).toContain("antes e depois");
    expect(prompt).toContain("curiosidade");
    expect(prompt).not.toContain("excesso");
    expect(prompt).toContain("16:9");
  });

  it("handles an empty patterns list", () => {
    const prompt = buildThumbnailPrompt("fitness", "Treino rápido", []);
    expect(prompt).toContain("nicho \"fitness\"");
    expect(prompt).toContain("Treino rápido");
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

describe("generateAlternativeTitles", () => {
  it("returns five titles with virality scores", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              titles: [
                { title: "Título variado 1", viralityScore: 90, rationale: "Usa curiosidade" },
                { title: "Título variado 2", viralityScore: 85, rationale: "Número específico" },
                { title: "Título variado 3", viralityScore: 80, rationale: "Promessa clara" },
                { title: "Título variado 4", viralityScore: 75, rationale: "Antes e depois" },
                { title: "Título variado 5", viralityScore: 70, rationale: "Erro comum" },
              ],
            }),
          },
        },
      ],
    } as never);

    const result = await generateAlternativeTitles("finanças", suggestion("O dinheiro que sobra"), [
      { pattern: "curiosidade", explanation: "x", evidenceVideoCount: 5, score: 90 },
    ]);

    expect(result.titles).toHaveLength(5);
    expect(result.suggestionTitle).toBe("O dinheiro que sobra");
    expect(result.titles.every((t) => typeof t.rationale === "string" && t.viralityScore >= 0 && t.viralityScore <= 100)).toBe(true);
  });

  it("throws on empty response, invalid JSON and too few titles", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({ choices: [] } as never);
    await expect(generateAlternativeTitles("IA", suggestion(), [])).rejects.toThrow("llm_empty_response");

    mockedInvokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: "{x" } }] } as never);
    await expect(generateAlternativeTitles("IA", suggestion(), [])).rejects.toThrow("llm_invalid_json");

    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ titles: [{ title: "um" }] }) } }],
    } as never);
    await expect(generateAlternativeTitles("IA", suggestion(), [])).rejects.toThrow("llm_invalid_structure");
  });

  it("clamps virality scores to the 0-100 range", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              titles: Array.from({ length: 5 }, (_, i) => ({
                title: `T${i}`,
                viralityScore: i === 0 ? 250 : i === 1 ? -30 : 80,
                rationale: "r",
              })),
            }),
          },
        },
      ],
    } as never);

    const result = await generateAlternativeTitles("IA", suggestion(), []);
    expect(result.titles[0]?.viralityScore).toBe(100);
    expect(result.titles[1]?.viralityScore).toBe(0);
  });
});

/**
 * Testes do router de favoritos/pastas/ideia-do-dia via caller do tRPC.
 * Os helpers de db são carregados por import() dinâmico dentro dos procedures,
 * então mockamos o módulo "./db" completo via vi.mock.
 */
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./db")>();
  return {
    ...mod,
    listThumbnailFolders: vi.fn(),
    createThumbnailFolder: vi.fn(),
    updateThumbnailFolder: vi.fn(),
    deleteThumbnailFolder: vi.fn(),
    moveThumbnailToFolder: vi.fn(),
    listAnalysesByUser: vi.fn(),
  };
});

import * as db from "./db";

const mockedListFolders = vi.mocked(db.listThumbnailFolders);
const mockedCreateFolder = vi.mocked(db.createThumbnailFolder);
const mockedUpdateFolder = vi.mocked(db.updateThumbnailFolder);
const mockedDeleteFolder = vi.mocked(db.deleteThumbnailFolder);
const mockedMoveThumbnail = vi.mocked(db.moveThumbnailToFolder);
const mockedListAnalyses = vi.mocked(db.listAnalysesByUser);

const folderUser = {
  id: 2,
  openId: "folder-user",
  email: "folder@example.com",
  name: "Folder User",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createFolderCtx(): TrpcContext {
  return {
    user: folderUser,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describe("extended folders (list/create/update/delete/move)", () => {
  it("lists the user's folders", async () => {
    mockedListFolders.mockResolvedValueOnce([
      { id: 1, userId: 2, name: "Canal principal", color: "#f59e0b", createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.listFolders();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Canal principal");
  });

  it("creates a folder with a color", async () => {
    mockedCreateFolder.mockResolvedValueOnce({
      id: 3,
      userId: 2,
      name: "Shorts",
      color: "#8b5cf6",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.createFolder({ name: "Shorts", color: "#8b5cf6" });
    expect(mockedCreateFolder).toHaveBeenCalledWith(2, "Shorts", "#8b5cf6");
    expect(result.name).toBe("Shorts");
  });

  it("renames a folder", async () => {
    mockedUpdateFolder.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await caller.extended.updateFolder({ folderId: 1, name: "Campanha X" });
    expect(mockedUpdateFolder).toHaveBeenCalledWith(2, 1, { name: "Campanha X", color: undefined });
  });

  it("deletes a folder", async () => {
    mockedDeleteFolder.mockResolvedValueOnce({ success: true } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.deleteFolder({ folderId: 1 });
    expect(result.success).toBe(true);
  });

  it("moves a thumbnail to a folder and back to the root", async () => {
    mockedMoveThumbnail.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await caller.extended.moveThumbnail({ thumbnailId: 10, folderId: 1 });
    expect(mockedMoveThumbnail).toHaveBeenCalledWith(2, 10, 1);

    mockedMoveThumbnail.mockResolvedValueOnce(undefined as never);
    await caller.extended.moveThumbnail({ thumbnailId: 10, folderId: null });
    expect(mockedMoveThumbnail).toHaveBeenCalledWith(2, 10, null);
  });
});

describe("extended.ideaOfTheDay", () => {
  function analysisRow(id: string, niche: string, createdAt: Date, suggestions: unknown[] = []) {
    return {
      id,
      userId: 2,
      niche,
      status: "completed",
      result: JSON.stringify({ suggestions, videos: [], patterns: [] }),
      createdAt,
      updatedAt: createdAt,
    } as never;
  }

  it("returns no_completed_analyses when the user has no completed analyses", async () => {
    mockedListAnalyses.mockResolvedValueOnce([] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaOfTheDay();
    expect(result).toEqual({ idea: null, reason: "no_completed_analyses" });
  });

  it("returns a suggestion from the primary niche, rotated by day", async () => {
    const a1 = analysisRow("a1", "fitness", new Date("2026-08-01"), [
      { title: "Treino de 10 min", hook: "Acorde e treine", angle: "Rotina rápida", viralityScore: 88 },
      { title: "Dieta flexível", hook: "Coma o que gosta", angle: "Liberdade alimentar", viralityScore: 70 },
    ]);
    const a2 = analysisRow("a2", "fitness", new Date("2026-08-05"), [
      { title: "Alongamento matinal", hook: "5 min de mobilidade", angle: "Saúde preventiva", viralityScore: 82 },
    ]);
    // Outro nicho com menos análises
    const a3 = analysisRow("a3", "games", new Date("2026-08-10"), [
      { title: "Setup barato", hook: "Jogue sem gastar", angle: "Custo-benefício", viralityScore: 90 },
    ]);
    mockedListAnalyses.mockResolvedValueOnce([a1, a2, a3] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaOfTheDay();

    expect(result.reason).toBeNull();
    expect(result.idea?.niche).toBe("fitness");
    expect(typeof result.idea?.analysisId).toBe("string");
    expect(result.idea?.suggestion.title).toBeTruthy();
    expect(result.idea?.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it("returns no_suggestions when the completed analysis has no suggestions", async () => {
    mockedListAnalyses.mockResolvedValueOnce([analysisRow("x", "IA", new Date())] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaOfTheDay();
    expect(result).toEqual({ idea: null, reason: "no_suggestions" });
  });
});

describe("extended.generateIdeaOutline", () => {
  function outlineRow(id: string, niche: string, createdAt: Date, suggestions: unknown[] = []) {
    return {
      id,
      userId: 2,
      niche,
      status: "completed",
      result: JSON.stringify({ suggestions, videos: [], patterns: [] }),
      createdAt,
      updatedAt: createdAt,
    } as never;
  }

  it("throws when the user has no completed analyses", async () => {
    mockedListAnalyses.mockResolvedValueOnce([] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.generateIdeaOutline()).rejects.toThrow("análise");
  });

  it("generates an outline from the primary niche suggestion of the day", async () => {
    const outlinePayload = {
      title: "Como fazer X em 10 min",
      totalLength: "8-12 min",
      acts: [
        { act: "open", label: "Abertura", duration: "1-2 min", points: ["gancho inicial"], keyLine: "fique até o final" },
        { act: "body", label: "Desenvolvimento", duration: "5-7 min", points: ["conteúdo"], keyLine: "o segredo é" },
        { act: "close", label: "Fechamento", duration: "1-2 min", points: ["CTA"], keyLine: "inscreva-se" },
      ],
      notes: ["usar cortes rápidos"],
    };
    mockedInvokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(outlinePayload) } }] } as never);

    const a = outlineRow("a1", "fitness", new Date("2026-08-01"), [
      { title: "Treino de 10 min", hook: "Acorde e treine", angle: "Rotina rápida", viralityScore: 88 },
    ]);
    mockedListAnalyses.mockResolvedValueOnce([a] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.generateIdeaOutline();

    expect(result.niche).toBe("fitness");
    expect(result.analysisId).toBe("a1");
    // O título do outline é padronizado com o título da sugestão pelo backend
    expect(result.outline.title).toBe("Treino de 10 min");
    expect(result.outline.acts).toHaveLength(3);
    expect(mockedInvokeLLM).toHaveBeenCalled();
  });

  it("throws when the chosen analysis has no suggestions", async () => {
    mockedInvokeLLM.mockClear();
    mockedListAnalyses.mockResolvedValueOnce([outlineRow("a2", "games", new Date())] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.generateIdeaOutline()).rejects.toThrow("sugestões");
  });
});
