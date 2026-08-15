import { and, asc, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";
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
      result: analyses.result,
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
import {
  analyses as analysesTable,
  suggestionThumbnails as stCols,
  InsertSuggestionThumbnail,
  watchedVideos,
  InsertWatchedVideo,
  watchedMetricsHistory,
  InsertWatchedMetricsHistory,
  thumbnailFolders,
  pinnedIdeaHistory,
} from "../drizzle/schema";

export async function saveSuggestionThumbnail(row: InsertSuggestionThumbnail) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(stCols).values(row);
}

export async function getThumbnailsByAnalysis(analysisId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stCols).where(eq(stCols.analysisId, analysisId));
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
    // Sort manualmente posicionado vem antes (sortOrder NULL = posição padrão)
    .orderBy(sql`(CASE WHEN ${stCols.sortOrder} IS NULL THEN 1 ELSE 0 END)`, stCols.sortOrder, stCols.createdAt);
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

// ---------- Pastas da galeria de favoritos ----------

export async function createThumbnailFolder(userId: number, name: string, color?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(thumbnailFolders).values({ userId, name, color: color ?? null });
  const id = result[0].insertId;
  return { id };
}

export async function listThumbnailFolders(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(thumbnailFolders).where(eq(thumbnailFolders.userId, userId)).orderBy(thumbnailFolders.createdAt);
}

export async function updateThumbnailFolder(userId: number, folderId: number, patch: { name?: string; color?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const owned = await db
    .select({ id: thumbnailFolders.id })
    .from(thumbnailFolders)
    .where(and(eq(thumbnailFolders.id, folderId), eq(thumbnailFolders.userId, userId)))
    .limit(1);
  if (owned.length === 0) throw new Error("Pasta não encontrada");
  await db.update(thumbnailFolders).set(patch).where(eq(thumbnailFolders.id, folderId));
  return { success: true } as const;
}

export async function deleteThumbnailFolder(userId: number, folderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const owned = await db
    .select({ id: thumbnailFolders.id })
    .from(thumbnailFolders)
    .where(and(eq(thumbnailFolders.id, folderId), eq(thumbnailFolders.userId, userId)))
    .limit(1);
  if (owned.length === 0) throw new Error("Pasta não encontrada");
  // Remove as thumbnails da pasta (volta para a raiz, mantendo os favoritos)
  await db.update(stCols).set({ folderId: null }).where(eq(stCols.folderId, folderId));
  await db.delete(thumbnailFolders).where(eq(thumbnailFolders.id, folderId));
  return { success: true } as const;
}

/**
 * Reordena thumbnails por ID em ordem de exibição, definindo sortOrder como
 * sequência crescente (1, 2, 3, ...) dentro da mesma pasta (folderId igual para
 * todas). IDs ausentes em orderedIds perdem a posição manual (voltam ao padrão).
 */
export async function reorderThumbnails(userId: number, folderId: number | null, orderedIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const unique = Array.from(new Set(orderedIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return { success: true } as const;
  // Verifica que todas pertencem ao usuário e à mesma pasta
  const rows = await db
    .select({ id: stCols.id, analysisId: stCols.analysisId, folderId: stCols.folderId })
    .from(stCols)
    .where(and(inArray(stCols.id, unique), eq(stCols.favorite, 1)));
  if (rows.length !== unique.length) throw new Error("Uma ou mais thumbnails não foram encontradas");
  for (const row of rows) {
    if (row.folderId !== folderId) {
      throw new Error("Todas as thumbnails precisam estar na mesma pasta para reordenar");
    }
    const owned = await db
      .select({ id: analysesTable.id })
      .from(analysesTable)
      .where(and(eq(analysesTable.id, row.analysisId), eq(analysesTable.userId, userId)))
      .limit(1);
    if (owned.length === 0) throw new Error("Uma ou mais thumbnails não pertencem a este usuário");
  }
  for (let i = 0; i < unique.length; i++) {
    await db.update(stCols).set({ sortOrder: i + 1 }).where(eq(stCols.id, unique[i]));
  }
  return { success: true } as const;
}

export async function moveThumbnailToFolder(userId: number, thumbnailId: number, folderId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (folderId !== null) {
    const folder = await db
      .select({ id: thumbnailFolders.id })
      .from(thumbnailFolders)
      .where(and(eq(thumbnailFolders.id, folderId), eq(thumbnailFolders.userId, userId)))
      .limit(1);
    if (folder.length === 0) throw new Error("Pasta não encontrada");
  }
  const rows = await db
    .select({ analysisId: stCols.analysisId, favorite: stCols.favorite })
    .from(stCols)
    .where(eq(stCols.id, thumbnailId))
    .limit(1);
  if (rows.length === 0) throw new Error("Thumbnail não encontrada");
  // Ao mudar de pasta, volta para a ordem padrão para o novo contexto
  await db.update(stCols).set({ folderId, sortOrder: null }).where(eq(stCols.id, thumbnailId));
  const owns = await db
    .select()
    .from(analysesTable)
    .where(and(eq(analysesTable.id, rows[0].analysisId), eq(analysesTable.userId, userId)))
    .limit(1);
  if (owns.length === 0) throw new Error("Thumbnail não pertence a este usuário");
  await db.update(stCols).set({ folderId }).where(eq(stCols.id, thumbnailId));
  return { success: true } as const;
}

/** Lista as ideias fixadas do histórico "Ideia do dia" do usuário. */
export async function listPinnedIdeas(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: pinnedIdeaHistory.id,
      date: pinnedIdeaHistory.date,
      analysisId: pinnedIdeaHistory.analysisId,
      suggestionTitle: pinnedIdeaHistory.suggestionTitle,
      niche: pinnedIdeaHistory.niche,
      viralityScore: pinnedIdeaHistory.viralityScore,
      sortOrder: pinnedIdeaHistory.sortOrder,
      notes: pinnedIdeaHistory.notes,
      createdAt: pinnedIdeaHistory.createdAt,
    })
    .from(pinnedIdeaHistory)
    .where(eq(pinnedIdeaHistory.userId, userId))
    .orderBy(
      asc(pinnedIdeaHistory.sortOrder),
      desc(pinnedIdeaHistory.createdAt)
    );
}

/** Fixa uma ideia do histórico no topo do painel (ignorada se já fixada). */
export async function pinIdea(
  userId: number,
  params: { date: string; analysisId: string; suggestionTitle: string; niche: string; viralityScore: number | null }
) {
  const db = await getDb();
  if (!db) return;
  const exists = await db
    .select({ id: pinnedIdeaHistory.id })
    .from(pinnedIdeaHistory)
    .where(
      and(
        eq(pinnedIdeaHistory.userId, userId),
        eq(pinnedIdeaHistory.date, params.date),
        eq(pinnedIdeaHistory.analysisId, params.analysisId),
        eq(pinnedIdeaHistory.suggestionTitle, params.suggestionTitle)
      )
    )
    .limit(1);
  if (exists.length > 0) return;
  await db.insert(pinnedIdeaHistory).values({
    userId,
    date: params.date,
    analysisId: params.analysisId,
    suggestionTitle: params.suggestionTitle,
    niche: params.niche,
    viralityScore: params.viralityScore,
    sortOrder: null,
  });
}

/** Remove a fixação de uma ideia. */
export async function unpinIdea(userId: number, pinnedId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(pinnedIdeaHistory)
    .where(and(eq(pinnedIdeaHistory.id, pinnedId), eq(pinnedIdeaHistory.userId, userId)));
}

/** Atualiza as anotações pessoais de uma ideia fixada. */
export async function updatePinnedNote(userId: number, pinnedId: number, notes: string) {
  const db = await getDb();
  if (!db) return;
  const owns = await db
    .select({ id: pinnedIdeaHistory.id })
    .from(pinnedIdeaHistory)
    .where(and(eq(pinnedIdeaHistory.id, pinnedId), eq(pinnedIdeaHistory.userId, userId)))
    .limit(1);
  if (owns.length === 0) throw new Error("Ideia fixada não encontrada");
  await db
    .update(pinnedIdeaHistory)
    .set({ notes: notes === "" ? null : notes })
    .where(eq(pinnedIdeaHistory.id, pinnedId));
}

/** Reordena as ideias fixadas pelo sortOrder (a posição na lista é a ordem desejada).
 *  Ideias fora da lista recebem sortOrder = null e aparecem depois das reordenadas. */
export async function reorderPinnedIdeas(userId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) return { success: false } as const;
  if (!Array.isArray(orderedIds)) throw new Error("IDs inválidos");
  const seen = new Set<number>();
  orderedIds.forEach((id, idx) => {
    if (typeof id !== "number" || !Number.isInteger(id)) throw new Error("ID inválido");
    if (seen.has(id)) throw new Error("IDs duplicados");
    seen.add(id);
  });
  for (let idx = 0; idx < orderedIds.length; idx += 1) {
    const id = orderedIds[idx];
    await db
      .update(pinnedIdeaHistory)
      .set({ sortOrder: idx + 1 })
      .where(and(eq(pinnedIdeaHistory.id, id as number), eq(pinnedIdeaHistory.userId, userId)));
  }
  if (seen.size > 0) {
    await db
      .update(pinnedIdeaHistory)
      .set({ sortOrder: null })
      .where(and(eq(pinnedIdeaHistory.userId, userId), not(inArray(pinnedIdeaHistory.id, orderedIds))));
  }
  return { success: true } as const;
}
