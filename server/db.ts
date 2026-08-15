import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  analysisVideos,
  analyses,
  InsertAnalysis,
  InsertAnalysisVideo,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function createAnalysis(analysis: InsertAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(analyses).values(analysis);
}

export async function updateAnalysis(
  id: string,
  patch: Partial<InsertAnalysis>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(analyses).set(patch).where(eq(analyses.id, id));
}

export async function getAnalysisById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(analyses).where(eq(analyses.id, id)).limit(1);
  return rows[0];
}

export async function listAnalysesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: analyses.id,
      niche: analyses.niche,
      status: analyses.status,
      createdAt: analyses.createdAt,
    })
    .from(analyses)
    .where(eq(analyses.userId, userId))
    .orderBy(desc(analyses.createdAt))
    .limit(50);
}

export async function saveVideos(
  analysisId: string,
  videos: InsertAnalysisVideo[]
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (videos.length === 0) return;
  await db.insert(analysisVideos).values(videos);
}

export async function getVideosByAnalysis(analysisId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(analysisVideos)
    .where(eq(analysisVideos.analysisId, analysisId))
    .orderBy(desc(analysisVideos.viewCount));
}

export async function deleteAnalysisVideos(analysisId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(analysisVideos).where(eq(analysisVideos.analysisId, analysisId));
}

export async function deleteAnalysis(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await deleteAnalysisVideos(id);
  await db.delete(analyses).where(eq(analyses.id, id));
}

export async function deleteAnalysesByIds(ids: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (ids.length === 0) return;
  await db.delete(analysisVideos).where(inArray(analysisVideos.analysisId, ids));
  await db.delete(analyses).where(inArray(analyses.id, ids));
}

export async function updateAnalysisProgress(id: string, step: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(analyses).set({ progressStep: Math.min(100, Math.max(0, step)) }).where(eq(analyses.id, id));
}

export async function getUserStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0 };
  const rows = await db
    .select({
      status: analyses.status,
    })
    .from(analyses)
    .where(eq(analyses.userId, userId));
  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed").length;
  return { total, completed };
}

export async function updateUserProfile(userId: number, patch: { name?: string | null; email?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateSet: Record<string, unknown> = {};
  if ("name" in patch) updateSet.name = patch.name ?? null;
  if ("email" in patch) updateSet.email = patch.email ?? null;
  if (Object.keys(updateSet).length > 0) {
    await db.update(users).set(updateSet).where(eq(users.id, userId));
  }
  return db.select().from(users).where(eq(users.id, userId)).limit(1).then((r) => r[0]);
}
import { analyses as analysesTable, suggestionThumbnails, InsertSuggestionThumbnail, watchedVideos, InsertWatchedVideo } from "../drizzle/schema";

export async function saveSuggestionThumbnail(row: InsertSuggestionThumbnail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(suggestionThumbnails).values(row);
}

export async function getThumbnailsByAnalysis(analysisId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suggestionThumbnails).where(eq(suggestionThumbnails.analysisId, analysisId));
}

export async function listWatchedVideos(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(watchedVideos).where(eq(watchedVideos.userId, userId)).orderBy(watchedVideos.updatedAt);
}

export async function addWatchedVideo(row: InsertWatchedVideo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(watchedVideos).values(row);
  return db.select().from(watchedVideos).where(eq(watchedVideos.userId, row.userId)).orderBy(watchedVideos.updatedAt);
}

export async function removeWatchedVideo(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(watchedVideos).where(and(eq(watchedVideos.id, id), eq(watchedVideos.userId, userId)));
}
import { watchedMetricsHistory, InsertWatchedMetricsHistory, suggestionThumbnails as stCols } from "../drizzle/schema";

export async function setThumbnailFavorite(userId: number, thumbnailId: number, favorite: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Garante que a thumbnail pertence ao usuário (via análise dele)
  const rows = await db
    .select({ analysisId: stCols.analysisId })
    .from(stCols)
    .where(eq(stCols.id, thumbnailId))
    .limit(1);
  const owner = rows[0];
  if (!owner) throw new Error("Thumbnail não encontrada");
  const owns = await db.select().from(analysesTable).where(and(eq(analysesTable.id, owner.analysisId), eq(analysesTable.userId, userId))).limit(1);
  if (owns.length === 0) throw new Error("Thumbnail não pertence a este usuário");
  await db.update(stCols).set({ favorite: favorite ? 1 : 0 }).where(eq(stCols.id, thumbnailId));
  return { success: true } as const;
}

export async function listFavoriteThumbnails(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(stCols)
    .innerJoin(analysesTable, eq(stCols.analysisId, analysesTable.id))
    .where(and(eq(stCols.favorite, 1), eq(analysesTable.userId, userId)))
    .orderBy(stCols.createdAt);
}

export async function recordWatchedMetrics(row: InsertWatchedMetricsHistory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(watchedMetricsHistory).values(row);
}

export async function listMetricsHistory(userId: number, watchedVideoId: number, limit = 60) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(watchedMetricsHistory)
    .where(and(eq(watchedMetricsHistory.userId, userId), eq(watchedMetricsHistory.watchedVideoId, watchedVideoId)))
    .orderBy(watchedMetricsHistory.recordedAt)
    .limit(limit);
}
