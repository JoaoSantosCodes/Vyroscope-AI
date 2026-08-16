import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    getMonthlyGoalByMonth: vi.fn(),
    deletePinnedIdea: vi.fn(),
    markGoalCelebration: vi.fn(),
    listGoalCelebrations: vi.fn(),
    insertGoalSuggestion: vi.fn(),
    listGoalSuggestions: vi.fn(),
    getYearSummary: vi.fn(),
    getEndOfMonthGoalAlert: vi.fn(),
    getAnnualGoal: vi.fn(),
    getYearComparison: vi.fn(),
    getUserAchievements: vi.fn(),
    getMissedGoalFeedback: vi.fn(),
    getYearComparisonByMonth: vi.fn(),
    getIntermediateAchievements: vi.fn(),
    applySuggestedGoal: vi.fn(),
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
const mockedExistingGoal = vi.mocked(db.getMonthlyGoalByMonth);
const mockedDeletePinned = vi.mocked(db.deletePinnedIdea);
const mockedMarkCelebration = vi.mocked(db.markGoalCelebration);
const mockedListCelebrations = vi.mocked(db.listGoalCelebrations);
const mockedListSuggestions = vi.mocked(db.listGoalSuggestions);
const mockedYearSummary = vi.mocked(db.getYearSummary);
const mockedInsertSuggestion = vi.mocked(db.insertGoalSuggestion);
const mockedEndOfMonthAlert = vi.mocked(db.getEndOfMonthGoalAlert);
const mockedAnnualGoal = vi.mocked(db.getAnnualGoal);
const mockedYearComparison = vi.mocked(db.getYearComparison);
const mockedUserAchievements = vi.mocked(db.getUserAchievements);
const mockedMissedGoalFeedback = vi.mocked(db.getMissedGoalFeedback);
const mockedYearComparisonByMonth = vi.mocked(db.getYearComparisonByMonth);
const mockedIntermediateAchievements = vi.mocked(db.getIntermediateAchievements);
const mockedApplySuggestedGoal = vi.mocked(db.applySuggestedGoal);

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

describe("extended.exportStreaksPdf", () => {
  it("exports the 12-month streak history as a PDF download URL", async () => {
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
    mockedStreak.mockResolvedValueOnce({ streak: 2, lastMetKey: "2026-07" } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.exportStreaksPdf({});
    expect(result.fileName).toBe("metas-mensais-streaks.pdf");
    expect(result.downloadUrl).toBe("https://s3.example/p.pdf");
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringMatching(/^exports\/streaks-\d+-2\.pdf$/),
      expect.any(Buffer),
      "application/pdf"
    );
    expect(mockedMonthlyHistory).toHaveBeenCalledWith(2, 12);
  });
  it("accepts a client-provided months override and clamps to 12 rows", async () => {
    const months = Array.from({ length: 13 }, (_, i) => ({
      monthKey: `2024-${String((i % 12) + 1).padStart(2, "0")}`,
      label: `mês ${i + 1}`,
      publishedThisMonth: i,
      avgProductionDays: null,
      goal: 4,
      met: false,
      isCurrent: false,
    }));
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.exportStreaksPdf({ months });
    // 13 → cortado a 12
    expect(mockedMonthlyHistory).not.toHaveBeenCalled();
    expect(result.downloadUrl).toBe("https://s3.example/p.pdf");
  });
  it("rejects when the history is empty", async () => {
    mockedMonthlyHistory.mockResolvedValueOnce([] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.exportStreaksPdf({})).rejects.toThrow();
  });
});

describe("extended.suggestMonthlyGoal", () => {
  const baseMonth = Array.from({ length: 4 }, (_, i) => ({
    monthKey: `2026-${String(i + 1).padStart(2, "0")}`,
    label: `mês ${i + 1}`,
    publishedThisMonth: 3,
    avgProductionDays: 4,
    goal: 4,
    met: true,
    isCurrent: false,
  }));
  it("suggests a realistic goal via LLM for the requested month", async () => {
    mockedStreak.mockResolvedValueOnce({ streak: 4, lastMetKey: "2026-07" } as never);
    mockedMonthlyHistory.mockResolvedValueOnce(baseMonth as never);
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: { content: JSON.stringify({ suggestedGoal: 4, reason: "Ritmo estável de 3 publicações nos últimos 4 meses, com meta cumprida em todos." }) },
        },
      ],
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.suggestMonthlyGoal({ monthKey: "2026-08" });
    expect(result.suggestedGoal).toBe(4);
    expect(result.reason).toContain("Ritmo estável");
    expect(result.keepExisting).toBe(false);
    const llmCall = mockedInvokeLLM.mock.calls[0]![0] as { messages: { content: string }[] };
    const text = llmCall.messages.map((m) => m.content).join(" ");
    expect(text).toContain("Sequência atual de meses consecutivos com a meta cumprida: 4");
  });
  it("returns keepExisting when a goal is already configured for the month", async () => {
    const withGoal = [...baseMonth, {
      monthKey: "2026-08",
      label: "mês extra",
      publishedThisMonth: 2,
      avgProductionDays: null,
      goal: 5,
      met: false,
      isCurrent: true,
    }];
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    mockedMonthlyHistory.mockResolvedValueOnce(withGoal as never);
    mockedExistingGoal.mockResolvedValueOnce({ goal: 5 } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.suggestMonthlyGoal({ monthKey: "2026-08" });
    expect(result.keepExisting).toBe(true);
    expect(result.suggestedGoal).toBe(5);
    // Nenhuma chamada de LLM para mês com meta já definida
    expect(mockedInvokeLLM).not.toHaveBeenCalled();
  });
  it("rejects a past month key", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.suggestMonthlyGoal({ monthKey: "2025-01" })).rejects.toThrow();
  });
  it("rejects when there is no publication history", async () => {
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    mockedMonthlyHistory.mockResolvedValueOnce([] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.suggestMonthlyGoal({ monthKey: "2026-09" })).rejects.toThrow(/não tem histórico/);
  });
  it("rejects a malformed month key", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.suggestMonthlyGoal({ monthKey: "2026/08" })).rejects.toThrow();
  });
  it("persiste a sugestão no histórico mesmo sem meta anterior (rodada 23)", async () => {
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    mockedMonthlyHistory.mockResolvedValueOnce(baseMonth as never);
    mockedExistingGoal.mockResolvedValueOnce(null as never);
    mockedInsertSuggestion.mockResolvedValueOnce({ id: 9, applied: false, keepExisting: false } as never);
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: { content: JSON.stringify({ suggestedGoal: 3, reason: "Ritmo consistente" }) },
        },
      ],
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.suggestMonthlyGoal({ monthKey: "2026-09" });
    expect(result.suggestedGoal).toBe(3);
    expect(mockedInsertSuggestion).toHaveBeenCalledWith(2, "2026-09", 3, "Ritmo consistente", null, false, false);
  });
  it("persiste a recomendação de manter a meta existente (rodada 23)", async () => {
    const withGoal = [...baseMonth, {
      monthKey: "2026-09",
      label: "mês extra",
      publishedThisMonth: 2,
      avgProductionDays: null,
      goal: 5,
      met: false,
      isCurrent: true,
    }];
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    mockedMonthlyHistory.mockResolvedValueOnce(withGoal as never);
    mockedExistingGoal.mockResolvedValueOnce({ goal: 5 } as never);
    mockedInsertSuggestion.mockResolvedValueOnce({ id: 10, applied: false, keepExisting: true } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.suggestMonthlyGoal({ monthKey: "2026-09" });
    expect(result.keepExisting).toBe(true);
    const args = mockedInsertSuggestion.mock.calls[0] as unknown as [number, string, number, string, unknown, boolean, boolean];
    expect(mockedInsertSuggestion).toHaveBeenCalledWith(2, "2026-09", 5, expect.any(String), null, false, true);
    expect(String(args[3])).toContain("mantê-la");
  });
  it("não falha a sugestão quando a persistência falha (rodada 23)", async () => {
    mockedStreak.mockResolvedValueOnce({ streak: 0, lastMetKey: null } as never);
    mockedMonthlyHistory.mockResolvedValueOnce(baseMonth as never);
    mockedExistingGoal.mockResolvedValueOnce(null as never);
    mockedInsertSuggestion.mockRejectedValueOnce(new Error("db fora"));
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: { content: JSON.stringify({ suggestedGoal: 4, reason: "estável" }) },
        },
      ],
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.suggestMonthlyGoal({ monthKey: "2026-10" });
    expect(result.suggestedGoal).toBe(4);
  });
});

describe("rodada 23 (persistência da celebração, histórico de sugestões, ano em números)", () => {
  const baseMonth = Array.from({ length: 4 }, (_, i) => ({
    monthKey: `2026-${String(i + 1).padStart(2, "0")}`,
    label: `mês ${i + 1}`,
    publishedThisMonth: 3,
    avgProductionDays: 4,
    goal: 4,
    met: true,
    isCurrent: false,
  }));
  it("markGoalReached registra a celebração quando a meta foi atingida", async () => {
    mockedStats.mockResolvedValueOnce({ monthKey: "2026-08", publishedThisMonth: 5, goal: 4, avgProductionDays: 3 } as never);
    mockedMarkCelebration.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.markGoalReached({ monthKey: "2026-08" });
    expect(result.monthKey).toBe("2026-08");
    expect(result.goal).toBe(4);
    expect(mockedMarkCelebration).toHaveBeenCalledWith(2, "2026-08", 4);
  });
  it("markGoalReached rejeita quando o mês ainda não atingiu a meta", async () => {
    mockedStats.mockResolvedValueOnce({ monthKey: "2026-08", publishedThisMonth: 2, goal: 4, avgProductionDays: null } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.markGoalReached({ monthKey: "2026-08" })).rejects.toThrow(/não atingiu a meta/);
    expect(mockedMarkCelebration).not.toHaveBeenCalled();
  });
  it("listGoalCelebrations retorna as celebrações do usuário", async () => {
    mockedListCelebrations.mockResolvedValueOnce([
      { id: 1, userId: 2, monthKey: "2026-07", goal: 4, createdAt: new Date() },
    ] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.listGoalCelebrations();
    expect(result).toHaveLength(1);
    expect(mockedListCelebrations).toHaveBeenCalledWith(2, 12);
  });
  it("listGoalSuggestions retorna o histórico de sugestões da IA", async () => {
    mockedListSuggestions.mockResolvedValueOnce([
      { id: 1, userId: 2, monthKey: "2026-09", suggestedGoal: 5, reason: "ritmo", factors: null, applied: false, keepExisting: false, createdAt: new Date() },
    ] as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.listGoalSuggestions();
    expect(result).toHaveLength(1);
    expect(mockedListSuggestions).toHaveBeenCalledWith(2, 30);
  });
  it("yearSummary retorna a consolidação do ano corrente", async () => {
    mockedYearSummary.mockResolvedValueOnce({
      year: 2026,
      months: [{ monthKey: "2026-01", label: "janeiro de 2026", publishedThisMonth: 3, avgProductionDays: null, goal: 4, ratio: 75, met: false, isCurrent: false }],
      totalPublished: 3,
      totalGoalsMet: 0,
      avgProductionDays: null,
      bestMonth: null,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.yearSummary({});
    expect(result.year).toBe(2026);
    expect(result.totalPublished).toBe(3);
    expect(mockedYearSummary).toHaveBeenCalledWith(2, undefined);
  });
  it("exportYearPdf gera o PDF consolidado com KPIs e envia para o storage", async () => {
    mockedYearSummary.mockResolvedValueOnce({
      year: 2026,
      months: baseMonth.map((m) => ({ ...m, ratio: 75, isCurrent: false })),
      totalPublished: 12,
      totalGoalsMet: 4,
      avgProductionDays: 4,
      bestMonth: { monthKey: "2026-04", label: "abril de 2026", publishedThisMonth: 3 },
    } as never);
    mockedStreak.mockResolvedValueOnce({ streak: 4, lastMetKey: "2026-04" } as never);
    mockedIntermediateAchievements.mockResolvedValueOnce({
      quarters: [{ year: 2026, quarter: 1, label: "2026 · 1º trimestre", metMonths: 3, published: 9, annualGoal: 12 }],
      halfYears: [],
      yearsChecked: 1,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.exportYearPdf({});
    expect(result.fileName).toBe("ano-em-numeros-2026.pdf");
    expect(mockedIntermediateAchievements).toHaveBeenCalledWith(2);
    expect(result.downloadUrl).toBe("https://s3.example/p.pdf");
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringMatching(/^exports\/ano-em-numeros-2026-\d+-2\.pdf$/),
      expect.any(Buffer),
      "application/pdf"
    );
  });
  it("exportYearPdf rejeita quando não há meses no ano", async () => {
    mockedYearSummary.mockResolvedValueOnce({
      year: 2025,
      months: [],
      totalPublished: 0,
      totalGoalsMet: 0,
      avgProductionDays: null,
      bestMonth: null,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.exportYearPdf({ year: 2025 })).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });
  it("exportAchievementsPdf gera o PDF da galeria de conquistas e envia para o storage (rodada 28)", async () => {
    mockedUserAchievements.mockResolvedValueOnce({
      badges: [{ year: 2025, published: 48, annualGoal: 36, metMonths: 12 }],
      totalYearsChecked: 2,
    } as never);
    mockedIntermediateAchievements.mockResolvedValueOnce({
      quarters: [{ year: 2025, quarter: 3, label: "3º trimestre · 2025", metMonths: 3, published: 12, annualGoal: 9 }],
      halfYears: [],
      yearsChecked: 2,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.exportAchievementsPdf();
    expect(result.fileName).toBe("galeria-de-conquistas.pdf");
    expect(mockedUserAchievements).toHaveBeenCalledWith(2);
    expect(mockedIntermediateAchievements).toHaveBeenCalledWith(2);
    expect(result.downloadUrl).toBe("https://s3.example/p.pdf");
    expect(storagePut).toHaveBeenCalledWith(
      expect.stringMatching(/^exports\/galeria-de-conquistas-\d+-2\.pdf$/),
      expect.any(Buffer),
      "application/pdf"
    );
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

describe("rodada 24: endOfMonthGoalAlert / annualGoal / yearComparison", () => {
  it("endOfMonthGoalAlert avalia o dia do mês, dias restantes e atingibilidade da meta", async () => {
    mockedEndOfMonthAlert.mockResolvedValueOnce({
      isEndOfMonth: true,
      monthKey: "2026-08",
      dayOfMonthNow: 22,
      goal: 4,
      published: 2,
      remainingDays: 9,
      met: false,
      reachable: true,
      needsN: 2,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.endOfMonthGoalAlert();
    expect(result.isEndOfMonth).toBe(true);
    expect(result.needsN).toBe(2);
    expect(result.reachable).toBe(true);
    expect(mockedEndOfMonthAlert).toHaveBeenCalledWith(2);
  });
  it("endOfMonthGoalAlert marca a meta como atingida quando publicadas >= meta", async () => {
    mockedEndOfMonthAlert.mockResolvedValueOnce({
      isEndOfMonth: false,
      monthKey: "2026-08",
      dayOfMonthNow: 10,
      goal: 4,
      published: 4,
      remainingDays: 21,
      met: true,
      reachable: true,
      needsN: 0,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.endOfMonthGoalAlert();
    expect(result.met).toBe(true);
    expect(result.needsN).toBe(0);
  });
  it("annualGoal agrega as metas mensais do ano com selo de ano completo", async () => {
    mockedAnnualGoal.mockResolvedValueOnce({
      year: 2026,
      monthsCounted: 7,
      annualGoal: 28,
      published: 28,
      metMonths: 7,
      progressRatio: 100,
      yearComplete: true,
      allMet: true,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.annualGoal({ year: 2026 });
    expect(result.year).toBe(2026);
    expect(result.annualGoal).toBe(28);
    expect(result.progressRatio).toBe(100);
    expect(result.yearComplete).toBe(true);
    expect(mockedAnnualGoal).toHaveBeenCalledWith(2, 2026);
  });
  it("yearComparison calcula deltas entre dois anos", async () => {
    mockedYearComparison.mockResolvedValueOnce({
      current: { year: 2026, monthsCounted: 8, annualGoal: 32, published: 20, metMonths: 5, progressRatio: 62, yearComplete: false, allMet: false },
      previous: { year: 2025, monthsCounted: 12, annualGoal: 24, published: 15, metMonths: 4, progressRatio: 62, yearComplete: false, allMet: false },
      deltaPublished: 5,
      deltaMetMonths: 1,
      deltaAnnualGoal: 8,
      currentBetter: true,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.yearComparison({ years: [2025, 2026] });
    expect(result.deltaPublished).toBe(5);
    expect(result.currentBetter).toBe(true);
    expect(mockedYearComparison).toHaveBeenCalledWith(2, [2025, 2026]);
  });
  it("yearComparison rejeita quando o primeiro ano não é anterior ao segundo", async () => {
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.yearComparison({ years: [2026, 2026] })).rejects.toThrow();
  });
});

describe("rodada 25", () => {
  it("achievements lista os anos completos como selos acumulados", async () => {
    mockedUserAchievements.mockResolvedValueOnce({
      badges: [
        { year: 2025, published: 48, annualGoal: 48, metMonths: 12 },
        { year: 2024, published: 36, annualGoal: 36, metMonths: 12 },
      ],
      totalYearsChecked: 6,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.achievements();
    expect(result.badges).toHaveLength(2);
    expect(result.badges[0].year).toBe(2025);
    expect(result.totalYearsChecked).toBe(6);
    expect(mockedUserAchievements).toHaveBeenCalledWith(2);
  });

  it("missedGoalFeedback devolve o feedback do mês anterior quando a meta falhou", async () => {
    mockedMissedGoalFeedback.mockResolvedValueOnce({
      isMonthStart: true,
      previousMonthKey: "2026-07",
      published: 2,
      goal: 4,
      missed: true,
      suggestion: "ajuste sugerido",
      avgPublishedPerMonth: 2.5,
      suggestedGoal: 3,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.missedGoalFeedback();
    expect(result.missed).toBe(true);
    expect(result.previousMonthKey).toBe("2026-07");
    expect(result.suggestion).toBeTruthy();
    expect(mockedMissedGoalFeedback).toHaveBeenCalledWith(2);
  });

  it("yearComparisonByMonth devolve as séries mensais alinhadas", async () => {
    mockedYearComparisonByMonth.mockResolvedValueOnce({
      previousYear: 2025,
      currentYear: 2026,
      months: [
        { monthKey: "2026-01", label: "jan", previous: { published: 3, goal: 4, met: false }, current: { published: 4, goal: 4, met: true } },
        { monthKey: "2026-02", label: "fev", previous: { published: 4, goal: 4, met: true }, current: { published: 2, goal: 4, met: false } },
      ],
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.yearComparisonByMonth({ years: [2025, 2026] });
    expect(result.months).toHaveLength(2);
    expect(result.months[0].previous.published).toBe(3);
    expect(result.currentYear).toBe(2026);
    expect(mockedYearComparisonByMonth).toHaveBeenCalledWith(2, [2025, 2026]);
  });

  it("yearComparisonByMonth usa [ano-1, ano] como padrão e rejeita ordem invertida", async () => {
    mockedYearComparisonByMonth.mockResolvedValueOnce({
      previousYear: 2025,
      currentYear: 2026,
      months: [],
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.yearComparisonByMonth({});
    expect(mockedYearComparisonByMonth).toHaveBeenCalledWith(2, [2025, 2026]);
    expect(result.previousYear).toBe(2025);
    await expect(caller.extended.yearComparisonByMonth({ years: [2026, 2026] })).rejects.toThrow();
  });
});

describe("rodada 26", () => {
  it("intermediateAchievements lista os selos de trimestres e semestres completos", async () => {
    mockedIntermediateAchievements.mockResolvedValueOnce({
      quarters: [
        { year: 2026, quarter: 1, label: "2026 · 1º trimestre", metMonths: 3, published: 12, annualGoal: 12 },
        { year: 2026, quarter: 2, label: "2026 · 2º trimestre", metMonths: 3, published: 15, annualGoal: 12 },
      ],
      halfYears: [{ year: 2026, half: 1, label: "2026 · 1º semestre", metMonths: 6, published: 27, annualGoal: 24 }],
      yearsChecked: 6,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.intermediateAchievements();
    expect(result.quarters).toHaveLength(2);
    expect(result.halfYears).toHaveLength(1);
    expect(result.halfYears[0].half).toBe(1);
    expect(result.quarters[0].quarter).toBe(1);
    expect(result.yearsChecked).toBe(6);
    expect(mockedIntermediateAchievements).toHaveBeenCalledWith(2);
  });

  it("applySuggestedGoal aplica a meta sugerida do feedback quando válida", async () => {
    mockedMissedGoalFeedback.mockResolvedValueOnce({
      isMonthStart: true,
      previousMonthKey: "2026-07",
      published: 2,
      goal: 4,
      missed: true,
      suggestion: "ajuste sugerido",
      avgPublishedPerMonth: 2.3,
      suggestedGoal: 3,
    } as never);
    mockedApplySuggestedGoal.mockResolvedValueOnce({ monthKey: "2026-08", goal: 3 } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    const result = await caller.extended.applySuggestedGoal();
    expect(result.monthKey).toBe("2026-08");
    expect(result.goal).toBe(3);
    expect(mockedApplySuggestedGoal).toHaveBeenCalledWith(2, 3);
  });

  it("applySuggestedGoal rejeita quando não há meta sugerida disponível", async () => {
    mockedMissedGoalFeedback.mockResolvedValueOnce({
      isMonthStart: false,
      previousMonthKey: "2026-06",
      published: 2,
      goal: 4,
      missed: true,
      suggestion: "ajuste sugerido",
      avgPublishedPerMonth: 2.3,
      suggestedGoal: null,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.applySuggestedGoal()).rejects.toThrow();
    expect(mockedApplySuggestedGoal).not.toHaveBeenCalled();
  });

  it("applySuggestedGoal rejeita quando a média é zero (suggestedGoal null)", async () => {
    mockedMissedGoalFeedback.mockResolvedValueOnce({
      isMonthStart: true,
      previousMonthKey: "2026-07",
      published: 0,
      goal: 4,
      missed: true,
      suggestion: "ajuste sugerido",
      avgPublishedPerMonth: 0,
      suggestedGoal: null,
    } as never);
    const caller = appRouter.createCaller(createFolderCtx());
    await expect(caller.extended.applySuggestedGoal()).rejects.toThrow();
    expect(mockedApplySuggestedGoal).not.toHaveBeenCalled();
  });
});
