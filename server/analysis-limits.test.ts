import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// (Rodada 36) Bloqueio por limites diários em analysis.run e analysis.retry.
// Padrão de stubs do projeto (analysis.test.ts): vi.hoisted + vi.mock("./db").

const db = vi.hoisted(() => ({
  createAnalysis: vi.fn().mockResolvedValue(undefined),
  updateAnalysis: vi.fn().mockResolvedValue(undefined),
  saveVideos: vi.fn().mockResolvedValue(undefined),
  listAnalysesByUser: vi.fn().mockResolvedValue([]),
  getAnalysisById: vi.fn().mockResolvedValue(undefined),
  updateAnalysisProgress: vi.fn().mockResolvedValue(undefined),
  getUserStats: vi.fn().mockResolvedValue({ total: 3, completed: 2 }),
  parseRetrySummary: vi.fn().mockReturnValue(null),
  appendRetryEvent: vi.fn().mockResolvedValue(undefined),
  recordApiUsage: vi.fn().mockResolvedValue(undefined),
  // (Rodada 37) recordBlockedAttemptFor chama getUserLimits/getUsageForBlock.
  getUserLimits: vi.fn().mockResolvedValue({
    dailyAnalysisLimit: 0,
    dailyTokenLimit: 10000,
    dailyQuotaLimit: 0,
    limitAction: "block",
    weeklyTokenLimit: 0,
    weeklyQuotaLimit: 0,
    monthlyTokenLimit: 0,
    monthlyQuotaLimit: 0,
    overrideUntil: 0,
  }),
  getUsageForBlock: vi.fn().mockResolvedValue(10200),
  recordBlockedAttempt: vi.fn().mockResolvedValue(undefined),
  // (Rodada 36) checagem de limites diários — a porta de proteção de custos.
  checkAnalysisLimits: vi.fn().mockResolvedValue({ blocked: false }),
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
vi.mock("./youtube", () => ({
  fetchTrendingVideosForNiche: vi.fn().mockResolvedValue([
    {
      id: "abc123",
      title: "Vídeo em alta",
      channelTitle: "Canal Teste",
      description: "Descrição",
      publishedAt: "2026-07-01T00:00:00Z",
      durationSeconds: 600,
      viewCount: 500000,
      likeCount: 25000,
      commentCount: 3000,
      thumbnailUrl: "https://example.com/thumb.jpg",
    },
  ]),
}));
vi.mock("./analysis", () => ({
  analyzeNiche: vi.fn().mockResolvedValue({
    patterns: [],
    videoScores: [{ videoId: "abc123", viralityScore: 78 }],
    suggestions: [],
    llmTokens: 1500,
    youtubeUnits: 0,
  }),
}));
vi.mock("./_core/imageGeneration", () => ({ generateImage: vi.fn().mockResolvedValue({ url: "x" }) }));
vi.mock("./retry", () => ({ appendRetryEvent: vi.fn().mockResolvedValue(undefined) }));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}
function sampleUser(id = 12): AuthenticatedUser {
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

let lastAnalysisState = { status: "running" };
beforeEach(() => {
  vi.clearAllMocks();
  db.checkAnalysisLimits.mockResolvedValue({ blocked: false });
  lastAnalysisState = { status: "running" };
  db.updateAnalysis.mockImplementation(async (_id: string, patch: { status?: string }) => {
    if (patch?.status) lastAnalysisState.status = patch.status;
    db.getAnalysisById.mockResolvedValue({
      id: "last",
      userId: 12,
      niche: "finanças",
      status: lastAnalysisState.status,
      retryLog: null,
    } as never);
    return undefined;
  });
  db.updateAnalysisProgress.mockResolvedValue(undefined);
  db.appendRetryEvent?.mockResolvedValue(undefined);
});

describe("analysis.run com limites diários (proteção de custos)", () => {
  it("checa os limites do usuário antes de executar a análise", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await caller.analysis.run({ niche: "finanças" });
    expect(db.checkAnalysisLimits).toHaveBeenCalledWith(12);
  });

  it("permite a análise quando não há bloqueio", async () => {
    const caller = appRouter.createCaller(createContext(sampleUser()));
    const result = await caller.analysis.run({ niche: "finanças" });
    expect(result.status).toBe("completed");
  });

  it("bloqueia com TOO_MANY_REQUESTS e mensagem clara quando o limite foi atingido", async () => {
    db.checkAnalysisLimits.mockResolvedValue({
      blocked: true,
      reason: "Limite de análises do dia (2) atingido. O contador zera à meia-noite.",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.run({ niche: "finanças" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // A tentativa bloqueada fica registrada como falha para constar no contador do dia.
    expect(db.createAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 12, niche: "finanças", status: "failed" })
    );
  });

  it("não cria a análise running quando está bloqueado", async () => {
    db.checkAnalysisLimits.mockResolvedValue({
      blocked: true,
      reason: "Limite diário de tokens atingido.",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.run({ niche: "finanças" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const runningCall = db.createAnalysis.mock.calls.find(
      (c) => (c[0] as { status: string }).status === "running"
    );
    expect(runningCall).toBeUndefined();
  });

  it("rejeita usuários não autenticados antes de qualquer checagem", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.analysis.run({ niche: "finanças" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(db.checkAnalysisLimits).not.toHaveBeenCalled();
  });

  it("modo 'apenas avisar': retorna PRECONDITION_FAILED (não bloqueia) e registra a tentativa pendente", async () => {
    db.checkAnalysisLimits.mockResolvedValue({
      needsConfirmation: true,
      reason: "Limite diário de tokens atingido. Confirme para executar mesmo assim.",
      dimension: "tokens",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.run({ niche: "finanças" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    // A tentativa fica registrada como pendente (sem confirmação) para o histórico.
    expect(db.createAnalysis).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 12, niche: "finanças", status: "failed" })
    );
  });

  it("o retry também pede confirmação no modo 'apenas avisar'", async () => {
    db.getAnalysisById.mockResolvedValue({
      id: "abc123",
      userId: 12,
      niche: "finanças",
      status: "failed",
      retryLog: null,
    });
    db.checkAnalysisLimits.mockResolvedValue({
      needsConfirmation: true,
      reason: "Limite diário de cota YouTube atingido.",
      dimension: "quota",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.retry({ analysisId: "abc123" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("analysis.retry com limites diários", () => {
  it("o retry também respeita o bloqueio de limites", async () => {
    db.getAnalysisById.mockResolvedValue({
      id: "abc123",
      userId: 12,
      niche: "finanças",
      status: "failed",
      retryLog: null,
    });
    db.checkAnalysisLimits.mockResolvedValue({
      blocked: true,
      reason: "Limite de tokens do dia atingido.",
    });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.retry({ analysisId: "abc123" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("o retry nega acesso a análises de outros usuários", async () => {
    db.getAnalysisById.mockResolvedValue({ id: "abc123", userId: 99, niche: "finanças", status: "failed", retryLog: null });
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.retry({ analysisId: "abc123" })).rejects.toBeTruthy();
  });

  it("o retry nega análises inexistentes", async () => {
    db.getAnalysisById.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext(sampleUser()));
    await expect(caller.analysis.retry({ analysisId: "inexistente" })).rejects.toBeTruthy();
  });
});
