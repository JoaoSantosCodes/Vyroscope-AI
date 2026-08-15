import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  addWatchedVideo: vi.fn(),
  listWatchedVideos: vi.fn(),
  removeWatchedVideo: vi.fn(),
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
    const updateFn = vi.fn();
    mockedGetDb.mockResolvedValueOnce({
      update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
    } as never);

    const caller = appRouter.createCaller(createCtx());
    const result = await caller.watched.list();

    expect(result).toHaveLength(1);
    expect(result[0]?.views).toBe(10000);
    expect(result[0]?.performanceScore).toBeGreaterThan(0);
    expect(result[0]?.performanceScore).toBeLessThanOrEqual(100);
    expect(updateFn).not.toHaveBeenCalled();
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
