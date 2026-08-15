import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  addWatchedVideo: vi.fn(),
  listWatchedVideos: vi.fn(),
  removeWatchedVideo: vi.fn(),
  recordWatchedMetrics: vi.fn(),
  listMetricsHistory: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./youtube", () => ({
  fetchVideoStatsById: vi.fn(),
}));

import { appRouter } from "./routers";
import * as db from "./db";
import { fetchVideoStatsById } from "./youtube";

const mockedAdd = vi.mocked(db.addWatchedVideo);
const mockedList = vi.mocked(db.listWatchedVideos);
const mockedRemove = vi.mocked(db.removeWatchedVideo);
const mockedRecordMetrics = vi.mocked(db.recordWatchedMetrics);
const mockedListMetrics = vi.mocked(db.listMetricsHistory);
const mockedStats = vi.mocked(fetchVideoStatsById);
const mockedGetDb = vi.mocked(db.getDb);

const user = {
  id: 1,
  openId: "watched-user",
  email: "watched@example.com",
  name: "Watched User",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createCtx(): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("watched.add", () => {
  it("adds a video accepting a full YouTube URL and extracts the ID", async () => {
    mockedAdd.mockResolvedValueOnce([] as never);
    const caller = appRouter.createCaller(createCtx());
    await caller.watched.add({
      youtubeId: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Meu vídeo",
      predictedScore: 78,
    });
    expect(mockedAdd).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, youtubeId: "dQw4w9WgXcQ", title: "Meu vídeo", predictedScore: 78 })
    );
  });

  it("rejects invalid YouTube IDs", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.watched.add({ youtubeId: "x", title: "t", predictedScore: 50 })
    ).rejects.toThrow();
  });
});

describe("watched.list", () => {
  it("refreshes metrics from YouTube and computes a performance score", async () => {
    const row = {
      id: 1,
      userId: 1,
      youtubeId: "dQw4w9WgXcQ",
      title: "Meu vídeo",
      suggestionTitle: null,
      predictedScore: 70,
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      publishedAt: new Date(),
      views: 100,
      likes: 10,
      comments: 5,
      metricsUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedList.mockResolvedValueOnce([row] as never);
    mockedStats.mockResolvedValueOnce({
      title: "Meu vídeo",
      viewCount: 10000,
      likeCount: 300,
      commentCount: 50,
      publishedAt: null,
    });
    mockedRecordMetrics.mockResolvedValueOnce(undefined as never);
    mockedGetDb.mockResolvedValueOnce({
      update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
    } as never);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.watched.list();

    expect(result).toHaveLength(1);
    expect(result[0]?.views).toBe(10000);
    expect(result[0]?.performanceScore).toBeGreaterThan(0);
    expect(result[0]?.performanceScore).toBeLessThanOrEqual(100);
  });

  it("marks a row as refreshError when YouTube stats cannot be fetched", async () => {
    mockedList.mockResolvedValueOnce([] as never);
    const caller = appRouter.createCaller(createCtx());
    await caller.watched.list();
  });
});

describe("watched.remove", () => {
  it("removes the watched video", async () => {
    mockedRemove.mockResolvedValueOnce(undefined as never);
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.watched.remove({ id: 1 });
    expect(result.success).toBe(true);
    expect(mockedRemove).toHaveBeenCalledWith(1, 1);
  });
});

describe("watched.metrics", () => {
  it("returns the metrics history of a watched video", async () => {
    const row = {
      id: 42,
      userId: 1,
      youtubeId: "dQw4w9WgXcQ",
      title: "Meu vídeo",
      predictedScore: 70,
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      publishedAt: new Date(),
      metricsUpdatedAt: new Date(),
    };
    mockedList.mockResolvedValueOnce([row] as never);
    // listMetricsHistory chama internamente getDb(); o mock de db lista o resultado via o mock da fn
    mockedListMetrics.mockImplementationOnce(async () => [
      {
        recordedAt: new Date("2026-08-14T10:00:00Z"),
        views: 100,
        likes: 10,
        comments: 5,
      },
      {
        recordedAt: new Date("2026-08-15T10:00:00Z"),
        views: 200,
        likes: 25,
        comments: 8,
      },
    ] as never);
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.watched.metrics({ id: 42 });
    expect(result.youtubeId).toBe("dQw4w9WgXcQ");
    expect(result.history).toHaveLength(2);
  });

  it("returns daily averages and growth indicators vs. the previous week", async () => {
    const row = {
      id: 5,
      userId: 1,
      youtubeId: "dQw4w9WgXcQ",
      title: "Meu vídeo",
      predictedScore: 70,
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      publishedAt: new Date(),
      metricsUpdatedAt: new Date(),
    };
    mockedList.mockResolvedValueOnce([row] as never);
    mockedListMetrics.mockImplementationOnce(async () => {
      // Semana anterior (3 pontos), última semana (2 pontos), hoje (2 leituras no mesmo dia)
      const points = [] as never;
      const add = (iso: string, views: number, likes: number) =>
        points.push({ recordedAt: new Date(iso), views, likes, comments: 0 } as never);
      add("2026-08-01T10:00:00Z", 100, 10);
      add("2026-08-02T10:00:00Z", 200, 20);
      add("2026-08-03T10:00:00Z", 150, 15);
      add("2026-08-11T10:00:00Z", 300, 30);
      add("2026-08-12T10:00:00Z", 500, 50);
      add("2026-08-15T08:00:00Z", 600, 60);
      add("2026-08-15T20:00:00Z", 700, 70);
      return points;
    });
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.watched.metrics({ id: 5 });
    expect(result.history).toHaveLength(7);
    // Médias diárias: 2026-08-15 média (600+700)/2=650; demais dias 1 ponto cada
    expect(result.daily).toEqual(
      expect.arrayContaining([expect.objectContaining({ date: "2026-08-15", views: 650, likes: 65 })])
    );
    expect(result.growth).not.toBeNull();
    expect(result.growth!.viewsPercent).toBeGreaterThan(0);
    expect(result.growth!.likesPercent).toBeGreaterThan(0);
    expect(result.growth!.lastWeekAvgViews).toBeGreaterThan(result.growth!.prevWeekAvgViews);
  });

  it("records a new metrics snapshot when listing watched videos", async () => {
    const row = {
      id: 7,
      userId: 1,
      youtubeId: "dQw4w9WgXcQ",
      title: "Meu vídeo",
      suggestionTitle: null,
      predictedScore: 70,
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      publishedAt: new Date(),
      views: 100,
      likes: 10,
      comments: 5,
      metricsUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedList.mockResolvedValueOnce([row] as never);
    mockedRecordMetrics.mockResolvedValueOnce(undefined as never);
    mockedStats.mockResolvedValueOnce({
      title: "Meu vídeo",
      viewCount: 10000,
      likeCount: 300,
      commentCount: 50,
      publishedAt: null,
    });
    mockedGetDb.mockResolvedValueOnce({
      update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
    } as never);
    const caller = appRouter.createCaller(createCtx());
    await caller.watched.list();
    expect(mockedRecordMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, watchedVideoId: 7, views: 10000, likes: 300, comments: 50 })
    );
  });
});
