import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Stubs de banco e dependências externas
const db = vi.hoisted(() => ({
  createAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysis: vi.fn().mockResolvedValue(undefined),
  saveVideos: vi.fn().mockResolvedValue(undefined),
  listAnalysesByUser: vi.fn().mockResolvedValue([]),
  getAnalysisById: vi.fn().mockResolvedValue(undefined),
  getVideosByAnalysis: vi.fn().mockResolvedValue([]),
  getThumbnailsByAnalysis: vi.fn().mockResolvedValue([]),
  deleteAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysisProgress: vi.fn().mockResolvedValue(undefined),
  getUserStats: vi.fn().mockResolvedValue({ total: 3, completed: 2 }),
  parseRetrySummary: vi.fn().mockReturnValue(null),
  // (Rodada 36) checagem de limites diários — sem bloqueio nos testes existentes.
  checkAnalysisLimits: vi.fn().mockResolvedValue({ blocked: false }),
  updateUserProfile: vi.fn().mockImplementation(async (_id: number, patch: { name?: string | null; email?: string | null }) =>
    Promise.resolve({
      id: 1,
      openId: "user-1",
      name: patch?.name ?? "User 1",
      email: patch?.email ?? "user1@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    })
  ),
}));

vi.mock("./db", () => db);
vi.mock("./providers", () => ({
  resolveLlmConfig: vi.fn().mockResolvedValue({
    apiUrl: "https://forge.manus.im/v1/chat/completions",
    apiKey: "forge-secret",
    model: undefined,
    provider: "manus-forge",
    active: true,
  }),
  resolveImageConfig: vi.fn().mockResolvedValue({
    apiUrl: "https://forge.manus.im/v1/images/generations",
    apiKey: "forge-secret",
    model: "dall-e-3",
    provider: "manus-forge",
    active: true,
  }),
}));
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn().mockResolvedValue({ url: "https://example.com/thumbnail.png" }),
}));
vi.mock("./youtube", () => ({
  fetchTrendingVideosForNiche: vi.fn().mockResolvedValue([
    {
      id: "abc123",
      title: "Vídeo em alta do nicho",
      channelTitle: "Canal Teste",
      description: "Descrição do vídeo",
      publishedAt: "2026-07-01T00:00:00Z",
      durationSeconds: 600,
      viewCount: 500000,
      likeCount: 25000,
      commentCount: 3000,
      thumbnailUrl: "https://example.com/thumb.jpg",
    },
  ]),
}));
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            patterns: [
              {
                pattern: "Promessa de transformação rápida",
                explanation: "Vídeos que prometem resultado em pouco tempo performam bem.",
                evidenceVideoCount: 1,
                score: 85,
              },
            ],
            videoScores: [{ videoId: "abc123", viralityScore: 78 }],
            suggestions: [
              {
                title: "Como conseguir X em 7 dias",
                hook: "Você não vai acreditar no que aconteceu...",
                angle: "Abordagem nova",
                narrativeStructure: "Abertura. Desenvolvimento. Fechamento.",
                targetLength: "8-10 min",
                viralityScore: 80,
                reasoning: "Padrão forte no nicho.",
              },
              {
                title: "Título 2",
                hook: "Hook 2",
                angle: "Ângulo 2",
                narrativeStructure: "Passo 1. Passo 2. Passo 3.",
                targetLength: "10 min",
                viralityScore: 70,
                reasoning: "Razão 2.",
              },
              {
                title: "Título 3",
                hook: "Hook 3",
                angle: "Ângulo 3",
                narrativeStructure: "Passo 1. Passo 2. Passo 3.",
                targetLength: "12 min",
                viralityScore: 65,
                reasoning: "Razão 3.",
              },
              {
                title: "Título 4",
                hook: "Hook 4",
                angle: "Ângulo 4",
                narrativeStructure: "Passo 1. Passo 2. Passo 3.",
                targetLength: "9 min",
                viralityScore: 60,
                reasoning: "Razão 4.",
              },
              {
                title: "Título 5",
                hook: "Hook 5",
                angle: "Ângulo 5",
                narrativeStructure: "Passo 1. Passo 2. Passo 3.",
                targetLength: "11 min",
                viralityScore: 55,
                reasoning: "Razão 5.",
              },
            ],
          }),
        },
      },
    ],
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

function sampleUser(id = 1): AuthenticatedUser {
  return {
    id,
    openId: `user-${id}`,
    email: `user${id}@example.com`,
    name: `User ${id}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analysis.run", () => {
  it("rejeita usuários não autenticados", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.analysis.run({ niche: "fitness" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("valida nicho vazio ou curto demais", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.run({ niche: "  " })).rejects.toThrow();
  });

  it("executa a análise e retorna o id com status final", async () => {
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 1,
      niche: "fitness",
      status: "completed",
      result: JSON.stringify({ niche: "fitness", analyzedAt: "", patterns: [], videoScores: [], suggestions: [] }),
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const result = await caller.analysis.run({ niche: "fitness" });
    expect(result.id).toBeTruthy();
    expect(result.niche).toBe("fitness");
    expect(result.status).toBe("completed");
    expect(db.createAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, niche: "fitness", status: "running" })
    );
    expect(db.updateAnalysis).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "completed" })
    );
  });

  it("retorna status failed quando a execução falha", async () => {
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 1,
      niche: "fitness",
      status: "failed",
      result: null,
      errorMessage: "Falha ao consultar o YouTube.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { fetchTrendingVideosForNiche } = await import("./youtube");
    vi.mocked(fetchTrendingVideosForNiche).mockRejectedValueOnce(new Error("YouTube unavailable"));
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const result = await caller.analysis.run({ niche: "fitness" });
    expect(result.status).toBe("failed");
  });

  it("identifica erro de rate limit na mensagem de falha", async () => {
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 1,
      niche: "fitness",
      status: "failed",
      result: null,
      errorMessage: "limite",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { fetchTrendingVideosForNiche } = await import("./youtube");
    vi.mocked(fetchTrendingVideosForNiche).mockRejectedValueOnce(
      new Error("Data API request failed (429 Too Many Requests)")
    );
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await caller.analysis.run({ niche: "fitness" });
    expect(db.updateAnalysis).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        errorMessage: expect.stringContaining("limite"),
      })
    );
  });
});

describe("analysis.list", () => {
  it("rejeita usuários não autenticados", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.analysis.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lista análises do próprio usuário", async () => {
    db.listAnalysesByUser.mockResolvedValueOnce([
      { id: "a1", niche: "fitness", status: "completed", retryLog: null, createdAt: new Date() },
    ]);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const rows = await caller.analysis.list();
    expect(rows).toHaveLength(1);
    expect(typeof rows[0]?.createdAt).toBe("number");
    expect(rows[0]?.retrySummary).toBeNull();
    expect(db.listAnalysesByUser).toHaveBeenCalledWith(1);
  });

  it("inclui o resumo de retentativas quando o retryLog existe", async () => {
    const retryLog = JSON.stringify([
      { attempt: 1, at: 1000, type: "retrying", message: "quota" },
      { attempt: 2, at: 6000, type: "succeeded", message: "ok" },
    ]);
    db.listAnalysesByUser.mockResolvedValueOnce([
      { id: "a2", niche: "finanças", status: "completed", retryLog, createdAt: new Date() },
    ]);
    // parseRetrySummary real do módulo (o mock global retorna null)
    db.parseRetrySummary.mockImplementationOnce((raw: string | null) => {
      const events = raw ? JSON.parse(raw) : [];
      const attempts = events.reduce((max: number, e: { attempt: number }) => Math.max(max, e.attempt), 0);
      const failures = events.filter((e: { type: string }) => e.type === "retrying" || e.type === "giving_up").length;
      return { attempts, failures, gaveUp: false };
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const rows = await caller.analysis.list();
    expect(rows[0]?.retrySummary).toEqual({ attempts: 2, failures: 1, gaveUp: false });
  });
});

describe("analysis.get", () => {
  it("bloqueia acesso a análise de outro usuário", async () => {
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 999,
      niche: "finanças",
      status: "completed",
      result: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.get({ id: "a1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("retorna análise concluída com vídeos e scores", async () => {
    const result = {
      niche: "fitness",
      analyzedAt: "2026-08-14T00:00:00Z",
      patterns: [],
      videoScores: [{ videoId: "abc123", viralityScore: 78 }],
      suggestions: [],
    };
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 1,
      niche: "fitness",
      status: "completed",
      result: JSON.stringify(result),
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    db.getVideosByAnalysis.mockResolvedValueOnce([
      {
        id: 1,
        analysisId: "a1",
        youtubeId: "abc123",
        title: "Vídeo em alta",
        channelTitle: "Canal",
        description: null,
        publishedAt: "2026-07-01T00:00:00Z",
        durationSeconds: 600,
        viewCount: 500000,
        likeCount: 25000,
        commentCount: 3000,
        thumbnailUrl: null,
      },
    ]);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const detail = await caller.analysis.get({ id: "a1" });
    expect(detail.status).toBe("completed");
    expect(detail.videos[0]?.score).toBe(78);
    expect(detail.result?.niche).toBe("fitness");
  });
});

describe("analysis.progress", () => {
  it("rejeita usuários não autenticados", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.analysis.progress({ id: "a1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retorna o progresso real gravado pelo backend", async () => {
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 1,
      niche: "fitness",
      status: "running",
      progressStep: 45,
      result: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const progress = await caller.analysis.progress({ id: "a1" });
    expect(progress.progressStep).toBe(45);
    expect(progress.status).toBe("running");
  });
});

describe("profile", () => {
  it("rejeita usuários não autenticados", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.profile.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("retorna dados do perfil com estatísticas", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const profile = await caller.profile.me();
    expect(profile.id).toBe(1);
    expect(profile.stats.total).toBe(3);
    expect(profile.stats.completed).toBe(2);
  });

  it("rejeita atualização com e-mail inválido", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.profile.update({ email: "invalido" })).rejects.toThrow();
  });

  it("atualiza nome e e-mail do perfil", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const updated = await caller.profile.update({ name: "João Santos", email: "joao@example.com" });
    expect(updated.name).toBe("João Santos");
    expect(updated.email).toBe("joao@example.com");
    expect(db.updateUserProfile).toHaveBeenCalledWith(1, { name: "João Santos", email: "joao@example.com" });
  });
});

describe("analysis.remove", () => {
  it("rejeita remoção de análise de outro usuário", async () => {
    db.getAnalysisById.mockResolvedValueOnce({
      id: "a1",
      userId: 999,
      niche: "games",
      status: "completed",
      result: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.remove({ id: "a1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(db.deleteAnalysis).not.toHaveBeenCalled();
  });
});
