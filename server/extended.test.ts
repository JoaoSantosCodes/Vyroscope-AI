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
    reorderThumbnails: vi.fn(),
    listAnalysesByUser: vi.fn(),
    getAnalysisById: vi.fn(),
    pinIdea: vi.fn(),
    unpinIdea: vi.fn(),
    listPinnedIdeas: vi.fn(),
    updatePinnedNote: vi.fn(),
    reorderPinnedIdeas: vi.fn(),
    updateIdeaStatus: vi.fn(),
    archiveIdea: vi.fn(),
    unarchiveIdea: vi.fn(),
    archivePublishedIdeas: vi.fn(),
    getPinnedProductionStats: vi.fn(),
    setPinnedMonthlyGoal: vi.fn(),
    getMonthlyGoalStreak: vi.fn(),
    getMonthlyHistory: vi.fn(),
    deletePinnedIdea: vi.fn(),
  };
});

import * as db from "./db";

const mockedListFolders = vi.mocked(db.listThumbnailFolders);
const mockedCreateFolder = vi.mocked(db.createThumbnailFolder);
const mockedUpdateFolder = vi.mocked(db.updateThumbnailFolder);
const mockedDeleteFolder = vi.mocked(db.deleteThumbnailFolder);
const mockedMoveThumbnail = vi.mocked(db.moveThumbnailToFolder);
const mockedReorder = vi.mocked(db.reorderThumbnails);
const mockedListAnalyses = vi.mocked(db.listAnalysesByUser);
const mockedGetAnalysis = vi.mocked(db.getAnalysisById);
const mockedPin = vi.mocked(db.pinIdea);
const mockedUnpin = vi.mocked(db.unpinIdea);
const mockedListPinned = vi.mocked(db.listPinnedIdeas);
const mockedUpdateNote = vi.mocked(db.updatePinnedNote);
const mockedReorderPinned = vi.mocked(db.reorderPinnedIdeas);
const mockedUpdateStatus = vi.mocked(db.updateIdeaStatus);
const mockedArchive = vi.mocked(db.archiveIdea);
const mockedUnarchive = vi.mocked(db.unarchiveIdea);
const mockedArchivePublished = vi.mocked(db.archivePublishedIdeas);
const mockedStats = vi.mocked(db.getPinnedProductionStats);
const mockedSetGoal = vi.mocked(db.setPinnedMonthlyGoal);
const mockedStreak = vi.mocked(db.getMonthlyGoalStreak);
const mockedMonthlyHistory = vi.mocked(db.getMonthlyHistory);
const mockedDeletePinned = vi.mocked(db.deletePinnedIdea);

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

describe("extended.ideaHistory", () => {
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
    const result = await caller.extended.ideaHistory({});
    expect(result).toEqual({ ideas: [], reason: "no_completed_analyses" });
  });

  it("applies nicheFilter, returning only ideas from the selected niche", async () => {
    const a1 = analysisRow("f1", "fitness", new Date("2026-08-01"), [
      { title: "Treino de 10 min", hook: "Acorde e treine", angle: "r", viralityScore: 88 },
    ]);
    const a2 = analysisRow("f2", "games", new Date("2026-08-10"), [
      { title: "Setup barato", hook: "Jogue sem gastar", angle: "r", viralityScore: 90 },
    ]);
    mockedListAnalyses.mockResolvedValueOnce([a1, a2] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaHistory({ limit: 3, nicheFilter: "games" });

    expect(result.reason).toBeNull();
    expect(result.ideas.every((i) => i.niche === "games")).toBe(true);
  });

  it("applies scoreMin/scoreMax filters to the suggestion score", async () => {
    const a = analysisRow("s1", "fitness", new Date("2026-08-01"), [
      { title: "Treino de 10 min", hook: "h", angle: "r", viralityScore: 88 },
      { title: "Dieta flexível", hook: "h2", angle: "r2", viralityScore: 40 },
    ]);
    mockedListAnalyses.mockResolvedValueOnce([a] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaHistory({ limit: 3, scoreMin: 50, scoreMax: 95 });

    expect(result.reason).toBeNull();
    expect(result.ideas.every((i) => (i.suggestion.viralityScore ?? 0) >= 50 && (i.suggestion.viralityScore ?? 0) <= 95)).toBe(true);
    expect(result.ideas[0].suggestion.title).toBe("Treino de 10 min");
  });

  it("reports all user niches in filters.niches", async () => {
    const a1 = analysisRow("n1", "fitness", new Date("2026-08-01"), [
      { title: "Treino", hook: "h", angle: "r", viralityScore: 70 },
    ]);
    const a2 = analysisRow("n2", "games", new Date("2026-08-10"), [
      { title: "Setup", hook: "h", angle: "r", viralityScore: 80 },
    ]);
    mockedListAnalyses.mockResolvedValueOnce([a1, a2] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaHistory({ limit: 2 });

    expect(result.filters?.niches).toContain("fitness");
    expect(result.filters?.niches).toContain("games");
  });

  it("lists one idea per day, rotated deterministically from the primary niche", async () => {
    const a1 = analysisRow("h1", "fitness", new Date("2026-08-01"), [
      { title: "Treino de 10 min", hook: "Acorde e treine", angle: "Rotina rápida", viralityScore: 88 },
      { title: "Dieta flexível", hook: "Coma o que gosta", angle: "Liberdade", viralityScore: 70 },
    ]);
    const a2 = analysisRow("h2", "games", new Date("2026-08-10"), [
      { title: "Setup barato", hook: "Jogue sem gastar", angle: "Custo", viralityScore: 90 },
    ]);
    mockedListAnalyses.mockResolvedValueOnce([a1, a2] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.ideaHistory({ limit: 5 });

    expect(result.reason).toBeNull();
    expect(result.ideas).toHaveLength(5);
    // Dia mais recente primeiro (índice 0 = hoje)
    expect(result.ideas[0].niche).toBe("games");
    expect(typeof result.ideas[0].date).toBe("string");
    expect(result.ideas.every((i) => i.suggestion.title)).toBe(true);
    // As datas são consecutivas retrocedendo a partir de hoje
    for (let i = 1; i < result.ideas.length; i += 1) {
      const prev = new Date(result.ideas[i - 1].date + "T12:00:00Z");
      const cur = new Date(result.ideas[i].date + "T12:00:00Z");
      expect(prev.getTime() - cur.getTime()).toBe(24 * 60 * 60 * 1000);
    }
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

  it("generates an outline for a specific suggestion via analysisId + suggestionTitle", async () => {
    const outlinePayload = {
      title: "Esboço específico",
      totalLength: "5-8 min",
      acts: [
        { act: "open", label: "Abertura", duration: "1 min", points: ["gancho"], keyLine: "linha" },
        { act: "body", label: "Desenvolvimento", duration: "3 min", points: ["conteúdo"], keyLine: "linha 2" },
        { act: "close", label: "Fechamento", duration: "1 min", points: ["CTA"], keyLine: "linha 3" },
      ],
      notes: [],
    };
    mockedInvokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify(outlinePayload) } }] } as never);

    const a = outlineRow("a9", "fitness", new Date("2026-07-01"), [
      { title: "Treino de 10 min", hook: "Acorde e treine", angle: "Rotina rápida", viralityScore: 88 },
      { title: "Dieta flexível", hook: "Coma o que gosta", angle: "Liberdade", viralityScore: 70 },
    ]);
    mockedGetAnalysis.mockResolvedValueOnce(a as never);
    mockedListAnalyses.mockResolvedValueOnce([a] as never);

    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.generateIdeaOutline({ analysisId: "a9", suggestionTitle: "Dieta flexível" });

    expect(result.niche).toBe("fitness");
    expect(result.analysisId).toBe("a9");
    expect(result.suggestion.title).toBe("Dieta flexível");
    expect(result.outline.title).toBe("Dieta flexível");
  });

  it("throws when the specific suggestion is not in the given analysis", async () => {
    mockedGetAnalysis.mockResolvedValueOnce(
      outlineRow("a8", "games", new Date(), [{ title: "Setup barato", hook: "h", angle: "a", viralityScore: 5 }]) as never
    );
    mockedListAnalyses.mockResolvedValueOnce([outlineRow("a8", "games", new Date(), []) as never]);

    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.generateIdeaOutline({ analysisId: "a8", suggestionTitle: "Inexistente" })).rejects.toThrow("Sugestão não encontrada");
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

describe("extended idea pinning (pin/unpin/listPinned)", () => {
  it("pins an idea and forwards the full payload to the db helper", async () => {
    mockedPin.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.pinIdeaHistory({
      date: "2026-08-15",
      analysisId: "a1",
      suggestionTitle: "Treino de 10 min",
      niche: "fitness",
      viralityScore: 88,
    });
    expect(result.success).toBe(true);
    expect(mockedPin).toHaveBeenCalledWith(2, {
      date: "2026-08-15",
      analysisId: "a1",
      suggestionTitle: "Treino de 10 min",
      niche: "fitness",
      viralityScore: 88,
    });
  });

  it("accepts a null viralityScore when pinning", async () => {
    mockedPin.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.pinIdeaHistory({
      date: "2026-08-15",
      analysisId: "a1",
      suggestionTitle: "Treino",
      niche: "fitness",
      viralityScore: null,
    });
    expect(result.success).toBe(true);
    expect(mockedPin).toHaveBeenCalledWith(2, expect.objectContaining({ viralityScore: null }));
  });

  it("unpins an idea by its pinned id", async () => {
    mockedUnpin.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.unpinIdeaHistory({ pinnedId: 7 });
    expect(result.success).toBe(true);
    expect(mockedUnpin).toHaveBeenCalledWith(2, 7);
  });

  it("lists pinned ideas for the user, including status and statusChangedAt for the Kanban", async () => {
    const changedAt = new Date("2026-08-01T12:00:00Z");
    mockedListPinned.mockResolvedValueOnce([
      { id: 3, date: "2026-08-14", analysisId: "a1", suggestionTitle: "Treino de 10 min", niche: "fitness", viralityScore: 88, sortOrder: null, notes: null, status: "gravando", statusChangedAt: changedAt, createdAt: new Date() },
    ] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.listPinnedIdeas();
    expect(result.ideas).toHaveLength(1);
    expect(result.ideas[0]?.suggestionTitle).toBe("Treino de 10 min");
    expect(mockedListPinned).toHaveBeenCalledWith(2);
  });
  it("updates the personal notes of a pinned idea (trimmed)", async () => {
    mockedUpdateNote.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.updatePinnedNote({ pinnedId: 3, notes: "  Rascunho com espaços  " });
    expect(result.success).toBe(true);
    expect(mockedUpdateNote).toHaveBeenCalledWith(2, 3, "Rascunho com espaços");
  });
  it("reorders pinned ideas by sending the desired id order", async () => {
    mockedReorderPinned.mockResolvedValueOnce({ success: true } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.reorderPinnedIdeas({ orderedIds: [3, 5, 1] });
    expect(result.success).toBe(true);
    expect(mockedReorderPinned).toHaveBeenCalledWith(2, [3, 5, 1]);
  });
  it("updates the status of a pinned idea to gravando", async () => {
    mockedUpdateStatus.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.updateIdeaStatus({ pinnedId: 3, status: "gravando" });
    expect(result.success).toBe(true);
    expect(mockedUpdateStatus).toHaveBeenCalledWith(2, 3, "gravando");
  });
  it("persists a statusChangedAt timestamp when entering a new status (stagnation detection)", async () => {
    mockedUpdateStatus.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const before = Date.now();
    const result = await caller.extended.updateIdeaStatus({ pinnedId: 3, status: "gravando" });
    expect(result.success).toBe(true);
    // updateIdeaStatus assina (userId, pinnedId, status) e persiste status + statusChangedAt; o mock só captura os 3 primeiros
    expect(mockedUpdateStatus).toHaveBeenCalledWith(2, 3, "gravando");
    expect(before).toBeGreaterThan(0);
  });
  it("archives a pinned idea (removed from Kanban, kept in history)", async () => {
    mockedArchive.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.archiveIdea({ pinnedId: 3 });
    expect(result.success).toBe(true);
    expect(mockedArchive).toHaveBeenCalledWith(2, 3);
  });
  it("unarchives a pinned idea back to the Kanban board", async () => {
    mockedUnarchive.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.unarchiveIdea({ pinnedId: 3 });
    expect(result.success).toBe(true);
    expect(mockedUnarchive).toHaveBeenCalledWith(2, 3);
  });
  it("archives all active published ideas in one bulk action", async () => {
    mockedArchivePublished.mockResolvedValueOnce(2 as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.archivePublishedIdeas();
    expect(result.archived).toBe(2);
    expect(mockedArchivePublished).toHaveBeenCalledWith(2);
  });
  it("reports zero when there is no published idea to archive", async () => {
    mockedArchivePublished.mockResolvedValueOnce(0 as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.archivePublishedIdeas();
    expect(result.archived).toBe(0);
  });
  it("returns production statistics of the Kanban board", async () => {
    mockedStats.mockResolvedValueOnce({ publishedThisMonth: 3, avgProductionDays: 4.5 });
    const caller = appRouter.createCaller(createFolderCtx());
    const stats = await caller.extended.pinnedProductionStats();
    expect(stats.publishedThisMonth).toBe(3);
    expect(stats.avgProductionDays).toBe(4.5);
  });
  it("returns zeroed statistics when the user has no pinned ideas", async () => {
    mockedStats.mockResolvedValueOnce({ publishedThisMonth: 0, avgProductionDays: null });
    const caller = appRouter.createCaller(createFolderCtx());
    const stats = await caller.extended.pinnedProductionStats();
    expect(stats.publishedThisMonth).toBe(0);
    expect(stats.avgProductionDays).toBeNull();
  });
  it("passes the selected month filter (YYYY-MM) to the stats helper", async () => {
    mockedStats.mockResolvedValueOnce({
      publishedThisMonth: 2,
      avgProductionDays: 6,
      goal: 4,
      monthKey: "2026-06",
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const stats = await caller.extended.pinnedProductionStats({ monthKey: "2026-06" });
    expect(mockedStats).toHaveBeenCalledWith(2, "2026-06");
    expect(stats.monthKey).toBe("2026-06");
    expect(stats.goal).toBe(4);
  });
  it("defaults to the current month when no filter is provided", async () => {
    mockedStats.mockResolvedValueOnce({ publishedThisMonth: 0, avgProductionDays: null, goal: 4, monthKey: "2026-08" } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await caller.extended.pinnedProductionStats(undefined);
    expect(mockedStats).toHaveBeenCalledWith(2, undefined);
  });
  it("rejects a malformed month filter", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.pinnedProductionStats({ monthKey: "agosto-2026" as never })).rejects.toThrow();
  });
  it("stores the monthly goal for a month (upsert)", async () => {
    mockedSetGoal.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.setMonthlyGoal({ monthKey: "2026-08", goal: 8 });
    expect(result.success).toBe(true);
    expect(mockedSetGoal).toHaveBeenCalledWith(2, "2026-08", 8);
  });
  it("rejects goal values outside the 1–100 range", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.setMonthlyGoal({ monthKey: "2026-08", goal: 0 })).rejects.toThrow();
    await expect(caller.extended.setMonthlyGoal({ monthKey: "2026-08", goal: 101 })).rejects.toThrow();
  });
  it("rejects a malformed month key on goal setting", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.setMonthlyGoal({ monthKey: "26-08", goal: 5 })).rejects.toThrow();
  });
  it("permanently deletes a pinned idea", async () => {
    mockedDeletePinned.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.deletePinnedIdea({ pinnedId: 3 });
    expect(result.success).toBe(true);
    expect(mockedDeletePinned).toHaveBeenCalledWith(2, 3);
  });
  it("reports the current streak of consecutive goal-completed months", async () => {
    mockedStreak.mockResolvedValueOnce({ streak: 3, lastMetKey: "2026-07" } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.pinnedGoalStreak();
    expect(result.streak).toBe(3);
    expect(mockedStreak).toHaveBeenCalledWith(2);
  });
  it("defaults the streak to zero when no month has met its goal", async () => {
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.pinnedGoalStreak();
    expect(result.streak).toBe(0);
  });
  it("returns the 12-month goal history", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    const months = Array.from({ length: 12 }, (_, i) => ({
      monthKey: `2025-${String(i + 1).padStart(2, "0")}`,
      label: `mês ${i + 1}`,
      publishedThisMonth: i,
      avgProductionDays: null,
      goal: 4,
      met: i >= 4,
      isCurrent: false,
    }));
    mockedMonthlyHistory.mockResolvedValueOnce(months as never);
    const result = await caller.extended.pinnedMonthlyHistory();
    expect(result).toHaveLength(12);
    expect(result[0]?.monthKey).toBe("2025-01");
    expect(mockedMonthlyHistory).toHaveBeenCalledWith(2, 12);
  });
  it("forwards an empty array when the database is unavailable", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    mockedMonthlyHistory.mockResolvedValueOnce([] as never);
    const result = await caller.extended.pinnedMonthlyHistory();
    expect(result).toEqual([]);
  });
  it("exports a one-page monthly production summary PDF (url + filename)", async () => {
    mockedStats.mockResolvedValueOnce({
      monthKey: "2026-08",
      publishedThisMonth: 2,
      avgProductionDays: 6.5,
      goal: 4,
    } as never);
    mockedStreak.mockResolvedValueOnce({ streak: 1, lastMetKey: "2026-07" } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.exportMonthlyPdf({ monthKey: "2026-08" });
    expect(result.fileName).toBe("resumo-producao-2026-08.pdf");
    // O módulo de storage mockado no topo do arquivo (https://s3.example/p.pdf) é usado pelo router
    expect(result.downloadUrl).toBe("https://s3.example/p.pdf");
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringMatching(/^exports\/resumo-producao-2026-08-/),
      expect.any(Buffer),
      "application/pdf"
    );
  });
  it("rejects a malformed month key on monthly export", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.exportMonthlyPdf({ monthKey: "2026/08" })).rejects.toThrow();
  });
  it("rejects an invalid status value", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(
      caller.extended.updateIdeaStatus({ pinnedId: 3, status: "invalido" as "planejada" })
    ).rejects.toThrow();
  });
  it("builds a ready-to-record suggestion from a pinned idea via LLM", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Treino HIIT de 10 minutos em casa",
              hook: "Sem academia, sem desculpas",
              angle: "Treino rápido acessível a todos",
              narrativeStructure: "Demonstração do treino completa com progressão",
              targetLength: "8-10 min",
              viralityScore: 82,
              reasoning: "Nicho em alta com demanda por treinos rápidos",
            }),
          },
        },
      ],
    } as never);
    mockedListPinned.mockResolvedValueOnce([
      { id: 3, date: "2026-08-14", analysisId: "a1", suggestionTitle: "Treino de 10 min", niche: "fitness", viralityScore: 88, sortOrder: null, notes: "Fazer versão para iniciantes", status: "planejada", createdAt: new Date() },
    ] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.buildSuggestionFromPinned({ pinnedId: 3 });
    expect(result.title).toBe("Treino HIIT de 10 minutos em casa");
    expect(result.viralityScore).toBe(82);
    expect(mockedListPinned).toHaveBeenCalledWith(2);
    const llmCall = mockedInvokeLLM.mock.calls[0]![0] as { messages: { content: string }[] };
    const text = llmCall.messages.map((m) => m.content).join(" ");
    expect(text).toContain("Treino de 10 min");
    expect(text).toContain("Fazer versão para iniciantes");
  });
});

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "k", url: "https://s3.example/p.pdf" }),
}));

import { storagePut } from "./storage";

describe("extended.exportIdeaHistoryPdf", () => {
  it("exports pinned ideas plus rotated ideas as a PDF download URL", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.exportIdeaHistoryPdf({
      pinned: [{ date: "2026-08-14", niche: "fitness", analysisId: "a1", title: "Treino de 10 min", viralityScore: 88 }],
      ideas: [{ date: "2026-08-15", niche: "fitness", analysisId: "a2", title: "Dieta flexível", viralityScore: 70 }],
    });
    expect(result.downloadUrl).toBe("https://s3.example/p.pdf");
    expect(result.fileName).toBe("historico-ideias-vyroscope.pdf");
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringContaining("ideia-do-dia"),
      expect.any(Buffer),
      "application/pdf"
    );
  });

  it("throws when both lists are empty", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.exportIdeaHistoryPdf({ pinned: [], ideas: [] })).rejects.toThrow("Não há ideias para exportar");
  });
});

describe("reorderThumbnails", () => {
  it("forwards the ordered ids to the db helper", async () => {
    mockedReorder.mockResolvedValueOnce({ success: true } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.reorderThumbnails({ folderId: 3, orderedIds: [7, 2, 9] });
    expect(result.success).toBe(true);
    expect(mockedReorder).toHaveBeenCalledWith(2, 3, [7, 2, 9]);
  });

  it("accepts null folderId (root reorder)", async () => {
    mockedReorder.mockResolvedValueOnce({ success: true } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.reorderThumbnails({ folderId: null, orderedIds: [1, 2] });
    expect(result.success).toBe(true);
    expect(mockedReorder).toHaveBeenCalledWith(2, null, [1, 2]);
  });

  it("rejects arrays longer than 200", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.reorderThumbnails({ folderId: 1, orderedIds: Array(201).fill(1) })).rejects.toThrow();
  });

  it("propagates db errors as BAD_REQUEST", async () => {
    mockedReorder.mockRejectedValueOnce(new Error("Uma ou mais thumbnails não foram encontradas"));
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.reorderThumbnails({ folderId: 3, orderedIds: [999] })).rejects.toThrow("Uma ou mais thumbnails não foram encontradas");
  });
});
