import { asc, desc, eq, inArray } from "drizzle-orm";
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
