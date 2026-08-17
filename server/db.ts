import { and, asc, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";
import { gte, lte } from "drizzle-orm/sql/expressions/conditions";
import { drizzle } from "drizzle-orm/mysql2";
import {
  apiUsage,
  analysisVideos,
  analyses,
  blockedAttempts,
  userLimits,
  InsertAnalysis,
  InsertAnalysisVideo,
  InsertBlockedAttempt,
  InsertUser,
  userSettings,
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
      retryLog: analyses.retryLog,
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

/**
 * (Rodada 33) Evento de retentativa do YouTube durante a coleta de vídeos.
 * Os eventos são acumulados em um JSON na coluna retryLog da análise.
 */
export type RetryEvent = {
  /** Tentativa em andamento (1 = primeira tentativa, 2+ = retentativas) */
  attempt: number;
  /** Momento do evento em ms desde o epoch (UTC) */
  at: number;
  /** Tipo de evento: "retrying" (vai tentar de novo) | "giving_up" (falha definitiva) */
  type: "retrying" | "giving_up" | "succeeded";
  /** Descrição legível em pt-BR */
  message: string;
  /** Código do erro ou motivo (ex.: "quota_429", "network", "http_503") */
  reason?: string;
  /** Segundos de espera antes da próxima tentativa (quando type = "retrying") */
  waitSeconds?: number;
};

/**
 * (Rodada 34) Parseia o retryLog bruto de uma análise em um resumo compacto
 * para o histórico: {attempts, failures, gaveUp, firstRetryAt?}.
 * Analisa o JSON com tolerância a falhas; sem eventos retorna null.
 */
export function parseRetrySummary(raw: string | null): {
  attempts: number;
  failures: number;
  gaveUp: boolean;
  firstRetryAt?: number;
} | null {
  let events: RetryEvent[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      events = Array.isArray(parsed) ? parsed : [];
    } catch {
      return null;
    }
  }
  if (events.length === 0) return null;
  // Tolerância: ignora entradas que não são eventos válidos
  const valid = events.filter((e) => typeof e?.attempt === "number");
  if (valid.length === 0) return null;
  const attempts = valid.reduce<number>((max, e) => Math.max(max, e.attempt), 0);
  const gaveUp = valid.some((e) => e.type === "giving_up");
  const failures = valid.filter((e) => e.type === "retrying" || e.type === "giving_up").length;
  const retries = valid.filter((e) => e.attempt > 1);
  const firstRetryAt = retries.length > 0 ? retries[0]!.at : undefined;
  return { attempts, failures, gaveUp, firstRetryAt };
}

export async function appendRetryEvent(id: string, event: RetryEvent) {
  const db = await getDb();
  if (!db) return;
  try {
    const rows = await db
      .select({ retryLog: analyses.retryLog })
      .from(analyses)
      .where(eq(analyses.id, id))
      .limit(1);
    const existing = rows[0]?.retryLog;
    let events: RetryEvent[] = [];
    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        events = Array.isArray(parsed) ? parsed : [];
      } catch {
        events = [];
      }
    }
    events.push(event);
    // Limita o log às últimas 40 entradas para não crescer indefinidamente
    const trimmed = events.slice(-40);
    await db
      .update(analyses)
      .set({ retryLog: JSON.stringify(trimmed) })
      .where(eq(analyses.id, id));
  } catch {
    // Log de retentativa é observável — nunca deve falhar a análise
  }
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

/**
 * (Rodada 31) Define ou remove o código secreto pessoal do usuário local
 * (persistido como hash SHA-256; o código em si nunca é salvo).
 * Quando `localCodeHash` for não-nulo, o login local aceita esse código
 * mesmo que o AUTH_SECRET_CODE global seja outro — útil em deploy próprio.
 */
export async function updateLocalCode(
  userId: number,
  localCodeHash: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ localCodeHash }).where(eq(users.id, userId));
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
  pinnedMonthlyGoal,
  goalCelebrations,
  goalSuggestions,
  InsertGoalCelebration,
  GoalSuggestion,
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
      status: pinnedIdeaHistory.status,
      statusChangedAt: pinnedIdeaHistory.statusChangedAt,
      archived: pinnedIdeaHistory.archived,
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
    status: "planejada",
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

/** Arquiva uma ideia fixada (sai do quadro Kanban, mantém o histórico). */
export async function archiveIdea(userId: number, pinnedId: number) {
  const db = await getDb();
  if (!db) return;
  const owns = await db
    .select({ id: pinnedIdeaHistory.id })
    .from(pinnedIdeaHistory)
    .where(and(eq(pinnedIdeaHistory.id, pinnedId), eq(pinnedIdeaHistory.userId, userId)))
    .limit(1);
  if (owns.length === 0) throw new Error("Ideia fixada não encontrada");
  await db.update(pinnedIdeaHistory).set({ archived: 1 }).where(eq(pinnedIdeaHistory.id, pinnedId));
}

/** Restaura uma ideia arquivada para o quadro Kanban. */
export async function unarchiveIdea(userId: number, pinnedId: number) {
  const db = await getDb();
  if (!db) return;
  const owns = await db
    .select({ id: pinnedIdeaHistory.id })
    .from(pinnedIdeaHistory)
    .where(and(eq(pinnedIdeaHistory.id, pinnedId), eq(pinnedIdeaHistory.userId, userId)))
    .limit(1);
  if (owns.length === 0) throw new Error("Ideia fixada não encontrada");
  await db.update(pinnedIdeaHistory).set({ archived: 0 }).where(eq(pinnedIdeaHistory.id, pinnedId));
}

/** Arquiva em massa todas as ideias publicadas e não arquivadas do usuário.
 *  Retorna o número de ideias arquivadas (0 quando nenhuma estava publicada). */
export async function archivePublishedIdeas(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const published = await db
    .select({ id: pinnedIdeaHistory.id })
    .from(pinnedIdeaHistory)
    .where(
      and(
        eq(pinnedIdeaHistory.userId, userId),
        eq(pinnedIdeaHistory.status, "publicada"),
        eq(pinnedIdeaHistory.archived, 0)
      )
    );
  if (published.length === 0) return 0;
  await db
    .update(pinnedIdeaHistory)
    .set({ archived: 1 })
    .where(
      and(
        eq(pinnedIdeaHistory.userId, userId),
        eq(pinnedIdeaHistory.status, "publicada"),
        eq(pinnedIdeaHistory.archived, 0)
      )
    );
  return published.length;
}

/** Meta mensal de publicações padrão quando não há registro na tabela. */
export const DEFAULT_MONTHLY_GOAL = 4;

/** Chave YYYY-MM de uma data no fuso do usuário do servidor. */
export function monthKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Estatísticas de produção do usuário para o mês indicado (YYYY-MM; padrão: mês corrente):
 *  publicadas no mês, tempo médio (dias) de produção até a publicação
 *  (createdAt → statusChangedAt quando status="publicada") e a meta configurada
 *  para o mês (DEFAULT_MONTHLY_GOAL quando não há registro). Ideias arquivadas
 *  entram na contagem do mês. */
export async function getPinnedProductionStats(userId: number, monthKey?: string) {
  const db = await getDb();
  if (!db) return { publishedThisMonth: 0, avgProductionDays: null, goal: DEFAULT_MONTHLY_GOAL, monthKey: "" };
  const now = new Date();
  const key = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : monthKeyOf(now);
  const [year, month] = key.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  let publishedThisMonth = 0;
  let publishedCount = 0;
  let totalDays = 0;
  const rows = await db
    .select({
      status: pinnedIdeaHistory.status,
      archived: pinnedIdeaHistory.archived,
      createdAt: pinnedIdeaHistory.createdAt,
      statusChangedAt: pinnedIdeaHistory.statusChangedAt,
    })
    .from(pinnedIdeaHistory)
    .where(eq(pinnedIdeaHistory.userId, userId));
  for (const row of rows) {
    if (row.status === "publicada" && row.statusChangedAt instanceof Date) {
      // Publicada no mês = mudança de status para "publicada" dentro do intervalo do mês
      if (row.statusChangedAt >= monthStart && row.statusChangedAt < monthEnd) {
        publishedThisMonth += 1;
      }
      if (row.createdAt instanceof Date) {
        // fixação retroativa: statusChangedAt pode preceder createdAt — nesses casos a jornada conta como 0 dias
        const days = Math.max(0, (row.statusChangedAt.getTime() - row.createdAt.getTime()) / 86400000);
        totalDays += days;
        publishedCount += 1;
      }
    }
  }
  const avgProductionDays = publishedCount > 0 ? Math.round((totalDays / publishedCount) * 10) / 10 : null;
  let goal = DEFAULT_MONTHLY_GOAL;
  const [goalRow] = await db
    .select({ goal: pinnedMonthlyGoal.goal })
    .from(pinnedMonthlyGoal)
    .where(and(eq(pinnedMonthlyGoal.userId, userId), eq(pinnedMonthlyGoal.monthKey, key)));
  if (goalRow && goalRow.goal > 0) goal = goalRow.goal;
  return { publishedThisMonth, avgProductionDays, goal, monthKey: key };
}

/** Dia do mês corrente (1–31) no fuso do servidor — usado para avaliar o
 * progresso da meta conforme o mês avança (rodada 20). */
export function dayOfMonth(date: Date = new Date()): number {
  return date.getDate();
}

/* ==================== Rodada 23: celebração persistente + sugestões de meta ==================== */

/** Registra que a meta do mês foi atingida (primeira vez → INSERT). Rodada 23. */
export async function markGoalCelebration(userId: number, monthKey: string, goal: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(goalCelebrations).values({ userId, monthKey, goal }).onDuplicateKeyUpdate({ set: { goal } });
}

/** Retorna as celebrações registradas do usuário, mais recentes primeiro. Rodada 23. */
export async function listGoalCelebrations(userId: number, limit = 12): Promise<InsertGoalCelebration[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(goalCelebrations).where(eq(goalCelebrations.userId, userId)).orderBy(desc(goalCelebrations.createdAt)).limit(limit);
}

/** Registra uma sugestão de meta gerada pela IA. Rodada 23. */
export async function insertGoalSuggestion(
  userId: number,
  monthKey: string,
  suggestedGoal: number,
  reason: string | null,
  factors: string[] | null,
  applied: boolean,
  keepExisting: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(goalSuggestions).values({
    userId,
    monthKey,
    suggestedGoal,
    reason,
    factors: factors ? JSON.stringify(factors) : null,
    applied: applied ? 1 : 0,
    keepExisting: keepExisting ? 1 : 0,
  });
}

/** Atualiza o flag applied de uma sugestão (quando a meta é aplicada após sugestão). Rodada 23. */
export async function markGoalSuggestionApplied(suggestionId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(goalSuggestions).set({ applied: 1 }).where(and(eq(goalSuggestions.id, suggestionId), eq(goalSuggestions.userId, userId)));
}

/** Histórico de sugestões de metas da IA do usuário, mais recentes primeiro. Rodada 23. */
export async function listGoalSuggestions(userId: number, limit = 30): Promise<GoalSuggestion[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(goalSuggestions).where(eq(goalSuggestions.userId, userId)).orderBy(desc(goalSuggestions.createdAt)).limit(limit);
}

/** Retorna a meta configurada para o mês (ou null se não houver). Rodada 22
 * — extrai a consulta para que o caminho "meta já existe" seja testável
 * isoladamente no teste do procedimento de sugestão. */
export async function getMonthlyGoalByMonth(
  userId: number,
  monthKey: string
): Promise<{ goal: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ goal: pinnedMonthlyGoal.goal })
    .from(pinnedMonthlyGoal)
    .where(and(eq(pinnedMonthlyGoal.userId, userId), eq(pinnedMonthlyGoal.monthKey, monthKey)));
  return row ?? null;
}

/** Histórico mês a mês retrocedendo a partir do mês corrente (inclusive, N=12
 * por padrão): para cada mês retorna monthKey, rótulo pt-BR, publicadas, meta,
 * média de dias de produção (null sem dados) e se a meta foi cumprida.
 * Rodada 21 — alimenta a página de streaks e o mini-gráfico de barras. */
export async function getMonthlyHistory(
  userId: number,
  months = 12
): Promise<
  {
    monthKey: string;
    label: string;
    publishedThisMonth: number;
    avgProductionDays: number | null;
    goal: number;
    met: boolean;
    isCurrent: boolean;
  }[]
> {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const currentKey = monthKeyOf(now);
  const rows: Awaited<ReturnType<typeof getMonthlyHistory>> = [];
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-based; iteração decremente primeiro
  for (let i = 0; i < months; i += 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const stats = await getPinnedProductionStats(userId, key);
    const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const met = stats.publishedThisMonth >= stats.goal;
    rows.push({
      monthKey: key,
      label,
      publishedThisMonth: stats.publishedThisMonth,
      avgProductionDays: stats.avgProductionDays,
      goal: stats.goal,
      met,
      isCurrent: key === currentKey,
    });
  }
  // Mais antigos primeiro (janeiro → corrente) para gráficos e lista
  return rows.reverse();
}

/** Consolida o "ano em números" do usuário para o ano corrente (ou ano
 * explícito): série de janeiro até o mês corrente com publicadas/meta/%/
 * cumprida, além dos agregados do ano (publicações totais, metas cumpridas,
 * média de produção, melhor mês). Rodada 23. */
export async function getYearSummary(userId: number, year: number = new Date().getFullYear()): Promise<{
  year: number;
  months: {
    monthKey: string;
    label: string;
    publishedThisMonth: number;
    avgProductionDays: number | null;
    goal: number;
    ratio: number;
    met: boolean;
    isCurrent: boolean;
  }[];
  totalPublished: number;
  totalGoalsMet: number;
  avgProductionDays: number | null;
  bestMonth: { monthKey: string; label: string; publishedThisMonth: number } | null;
}> {
  const db = await getDb();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentKey = monthKeyOf(now);
  const months: Awaited<ReturnType<typeof getYearSummary>>["months"] = [];
  for (let m = 1; m <= 12; m += 1) {
    // Meses futuros do ano corrente ficam fora da série
    if (year === currentYear && m > currentMonth) break;
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const stats = await getPinnedProductionStats(userId, key);
    const label = new Date(year, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const ratio = stats.goal > 0 ? Math.round((stats.publishedThisMonth / stats.goal) * 100) : 0;
    months.push({
      monthKey: key,
      label,
      publishedThisMonth: stats.publishedThisMonth,
      avgProductionDays: stats.avgProductionDays,
      goal: stats.goal,
      ratio,
      met: stats.publishedThisMonth >= stats.goal,
      isCurrent: key === currentKey,
    });
  }
  const totalPublished = months.reduce((sum, m) => sum + m.publishedThisMonth, 0);
  const totalGoalsMet = months.filter((m) => m.met).length;
  const withDays = months.filter((m) => m.avgProductionDays !== null).map((m) => m.avgProductionDays as number);
  const avgProductionDays = withDays.length > 0 ? Math.round((withDays.reduce((a, b) => a + b, 0) / withDays.length) * 10) / 10 : null;
  const best = months.reduce<Awaited<ReturnType<typeof getYearSummary>>["bestMonth"]>(
    (acc, m) => (!acc || m.publishedThisMonth > acc.publishedThisMonth ? { monthKey: m.monthKey, label: m.label, publishedThisMonth: m.publishedThisMonth } : acc),
    null
  );
  return { year, months, totalPublished, totalGoalsMet, avgProductionDays, bestMonth: best };
}

/** Quantos meses consecutivos (retrocedendo do mês corrente, exclusive, sem
 * pular meses) tiveram a meta cumprida (publicadas >= goal do mês).
 * Meses sem nenhum registro de ideia publicada interrompem o streak. */
export async function getMonthlyGoalStreak(userId: number): Promise<{ streak: number; lastMetKey: string | null }> {
  const db = await getDb();
  if (!db) return { streak: 0, lastMetKey: null };
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based: o mês anterior ao corrente é a primeira casa
  let streak = 0;
  let lastMetKey: string | null = null;
  while (streak < 24) {
    // mês anterior na iteração
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const stats = await getPinnedProductionStats(userId, key);
    if (stats.publishedThisMonth >= stats.goal) {
      streak += 1;
      lastMetKey = key;
    } else {
      break;
    }
  }
  return { streak, lastMetKey };
}

/** Define a meta de publicações de um mês (upsert: reescreve se já existir). */
export async function setPinnedMonthlyGoal(userId: number, monthKey: string, goal: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: pinnedMonthlyGoal.id })
    .from(pinnedMonthlyGoal)
    .where(and(eq(pinnedMonthlyGoal.userId, userId), eq(pinnedMonthlyGoal.monthKey, monthKey)));
  if (existing.length > 0) {
    await db
      .update(pinnedMonthlyGoal)
      .set({ goal })
      .where(and(eq(pinnedMonthlyGoal.userId, userId), eq(pinnedMonthlyGoal.monthKey, monthKey)));
  } else {
    await db.insert(pinnedMonthlyGoal).values({ userId, monthKey, goal });
  }
}

/** Remove definitivamente uma ideia (arquivada ou não) do histórico. */
export async function deletePinnedIdea(userId: number, pinnedId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(pinnedIdeaHistory)
    .where(and(eq(pinnedIdeaHistory.id, pinnedId), eq(pinnedIdeaHistory.userId, userId)));
}

/** Atualiza o status de produção de uma ideia fixada, registrando o momento da mudança. */
export async function updateIdeaStatus(userId: number, pinnedId: number, status: "planejada" | "gravando" | "publicada") {
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
    .set({ status, statusChangedAt: new Date() })
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

/* ==================== Rodada 24: alerta fim de mês, meta anual e comparativo de anos ==================== */

export const END_OF_MONTH_DAY_THRESHOLD = 20;

/** Alerta de fim de mês: avalia se o mês está avançando (dia >= 20), a meta
 * ainda não foi atingida e ainda há dias suficientes para atingi-la
 * (publicadas + dias restantes >= meta). Rodada 24. */
export async function getEndOfMonthGoalAlert(userId: number): Promise<{
  isEndOfMonth: boolean;
  monthKey: string;
  dayOfMonthNow: number;
  goal: number;
  published: number;
  remainingDays: number;
  met: boolean;
  reachable: boolean;
  needsN: number;
}> {
  const db = await getDb();
  const now = new Date();
  const dayNow = now.getDate();
  const key = monthKeyOf(now);
  const stats = await getPinnedProductionStats(userId, key);
  const { goal, publishedThisMonth } = stats;
  const year = now.getFullYear();
  const month = now.getMonth();
  // dias restantes no mês: total do mês - dia corrente
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const remainingDays = totalDaysInMonth - dayNow;
  const met = publishedThisMonth >= goal;
  const needsN = Math.max(0, goal - publishedThisMonth);
  const reachable = publishedThisMonth + remainingDays >= goal;
  return {
    isEndOfMonth: dayNow >= END_OF_MONTH_DAY_THRESHOLD,
    monthKey: key,
    dayOfMonthNow: dayNow,
    goal,
    published: publishedThisMonth,
    remainingDays,
    met,
    reachable,
    needsN,
  };
}

/** Resumo agregado de um ano: soma das metas mensais, publicações acumuladas,
 * meses com meta cumprida, média de produção e flag de "ano completo" (todos
 * os meses do ano — ou todos os passados + mês corrente — cumpriram a meta).
 * Rodada 24. */
export async function getAnnualGoal(userId: number, year: number = new Date().getFullYear()): Promise<{
  year: number;
  monthsCounted: number;
  annualGoal: number;
  published: number;
  metMonths: number;
  progressRatio: number;
  yearComplete: boolean;
  allMet: boolean;
}> {
  const summary = await getYearSummary(userId, year);
  const months = summary.months;
  const annualGoal = months.reduce((sum, m) => sum + m.goal, 0);
  const published = months.reduce((sum, m) => sum + m.publishedThisMonth, 0);
  const metMonths = months.filter((m) => m.met).length;
  const progressRatio = annualGoal > 0 ? Math.round((published / annualGoal) * 100) : 0;
  // Ano completo: todos os meses computados cumpriram a meta e há pelo menos um mês
  const allMet = months.length > 0 && metMonths === months.length;
  return { year, monthsCounted: months.length, annualGoal, published, metMonths, progressRatio, yearComplete: allMet, allMet };
}

/** Comparativo entre dois anos: soma os resumos anuais e calcula deltas.
 * Rodada 24. */
export async function getYearComparison(userId: number, years: [number, number]): Promise<{
  current: Awaited<ReturnType<typeof getAnnualGoal>>;
  previous: Awaited<ReturnType<typeof getAnnualGoal>>;
  deltaPublished: number;
  deltaMetMonths: number;
  deltaAnnualGoal: number;
  currentBetter: boolean;
}> {
  const current = await getAnnualGoal(userId, years[1]);
  const previous = await getAnnualGoal(userId, years[0]);
  const deltaPublished = current.published - previous.published;
  const deltaMetMonths = current.metMonths - previous.metMonths;
  const deltaAnnualGoal = current.annualGoal - previous.annualGoal;
  return { current, previous, deltaPublished, deltaMetMonths, deltaAnnualGoal, currentBetter: current.published > previous.published };
}
/* ==================== Rodada 25: galeria de conquistas, feedback de início de mês e comparativo mês a mês ==================== */
/** Galeria de conquistas: retorna os anos completos do usuário (todos os meses
 * contabilizados cumpriram a meta) como selos, do mais recente para o mais
 * antigo, mais o total de anos analisados. Rodada 25. */
export async function getUserAchievements(userId: number): Promise<{
  badges: { year: number; published: number; annualGoal: number; metMonths: number }[];
  totalYearsChecked: number;
}> {
  const db = await getDb();
  if (!db) return { badges: [], totalYearsChecked: 0 };
  const now = new Date();
  // Verifica do ano anterior até 2020 (anos futuros parciais não contam como selo)
  const badges: Awaited<ReturnType<typeof getUserAchievements>>["badges"] = [];
  let totalYearsChecked = 0;
  for (let y = now.getFullYear() - 1; y >= 2020; y -= 1) {
    totalYearsChecked += 1;
    const agg = await getAnnualGoal(userId, y);
    if (agg.monthsCounted > 0 && agg.yearComplete) {
      badges.push({ year: y, published: agg.published, annualGoal: agg.annualGoal, metMonths: agg.metMonths });
    }
  }
  return { badges, totalYearsChecked };
}
/** Feedback de início de mês: avalia o mês anterior — se a meta não foi
 * atingida, devolve o contexto e uma sugestão de ajuste (reduzir a meta para o
 * ritmo histórico ou manter com plano de ação). Rodada 25. */
export async function getMissedGoalFeedback(userId: number): Promise<{
  isMonthStart: boolean;
  previousMonthKey: string;
  published: number;
  goal: number;
  missed: boolean;
  suggestion: string;
  avgPublishedPerMonth: number | null;
  suggestedGoal: number | null;
}> {
  const db = await getDb();
  const now = new Date();
  const dayNow = now.getDate();
  const isMonthStart = dayNow <= 5;
  const prev = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevKey = monthKeyOf(prev);
  const stats = await getPinnedProductionStats(userId, prevKey);
  const { goal, publishedThisMonth } = stats;
  const missed = publishedThisMonth < goal;
  // Média de publicações por mês nos últimos 6 meses (excluindo o anterior já incluso via histórico? inclui)
  const history = await getMonthlyHistory(userId, 6);
  const avgPublishedPerMonth =
    history.length > 0 ? Math.round((history.reduce((s, m) => s + m.publishedThisMonth, 0) / history.length) * 10) / 10 : null;
  let suggestion = "";
  if (!missed) {
    suggestion = "A meta do mês anterior foi atingida — continue nesse ritmo e avalie elevar a meta gradualmente.";
  } else if (avgPublishedPerMonth !== null && avgPublishedPerMonth > 0 && goal > Math.ceil(avgPublishedPerMonth)) {
    suggestion = `No mês anterior, ${publishedThisMonth} de ${goal} publicações (${goal - publishedThisMonth} a menos). Sua média recente é de ${avgPublishedPerMonth} publicações/mês — considere ajustar a meta para ${Math.ceil(avgPublishedPerMonth)} ou planejar as faltantes no início deste mês.`;
  } else if (avgPublishedPerMonth !== null && avgPublishedPerMonth === 0) {
    suggestion = `O mês anterior terminou com 0 de ${goal} publicações. Comece o mês com pelo menos uma ideia fixada no quadro Kanban para retomar o ritmo.`;
  } else {
    suggestion = `O mês anterior terminou com ${publishedThisMonth} de ${goal} publicações (${goal - publishedThisMonth} a menos). Use o quadro Kanban para planejar as pendências logo no início do mês.`;
  }
  // Meta sugerida com base na média dos últimos 6 meses (usável pelo botão "Aplicar meta sugerida")
  const suggestedGoal =
    avgPublishedPerMonth !== null && avgPublishedPerMonth > 0 ? Math.ceil(avgPublishedPerMonth) : null;
  return { isMonthStart, previousMonthKey: prevKey, published: publishedThisMonth, goal, missed, suggestion, avgPublishedPerMonth, suggestedGoal };
}
/** Comparativo mês a mês entre dois anos: para cada mês (1..12) devolve as
 * publicações e metas de cada ano, permitindo barras agrupadas lado a lado.
 * Rodada 25. */
export async function getYearComparisonByMonth(userId: number, years: [number, number]): Promise<{
  previousYear: number;
  currentYear: number;
  months: {
    monthKey: string;
    label: string;
    previous: { published: number; goal: number; met: boolean };
    current: { published: number; goal: number; met: boolean };
  }[];
}> {
  const [prevSummary, currSummary] = await Promise.all([getYearSummary(userId, years[0]), getYearSummary(userId, years[1])]);
  const months: Awaited<ReturnType<typeof getYearComparisonByMonth>>["months"] = [];
  // 12 meses (mês corrente de curr em diante fica fora em getYearSummary; alinhamos pelo número do mês)
  for (let m = 1; m <= 12; m += 1) {
    const key = `${years[1]}-${String(m).padStart(2, "0")}`;
    const label = new Date(years[1], m - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
    const pmKey = `${years[0]}-${String(m).padStart(2, "0")}`;
    const prev: (Awaited<ReturnType<typeof getYearSummary>>["months"])[number] | undefined = prevSummary.months.find((pm) => pm.monthKey === pmKey);
    const curr: (Awaited<ReturnType<typeof getYearSummary>>["months"])[number] | undefined = currSummary.months.find((cm) => cm.monthKey === key);
    // Só inclui meses que existam em pelo menos um dos anos
    if (!prev && !curr) break;
    months.push({
      monthKey: key,
      label,
      previous: prev ? { published: prev.publishedThisMonth, goal: prev.goal, met: prev.met } : { published: 0, goal: 0, met: false },
      current: curr ? { published: curr.publishedThisMonth, goal: curr.goal, met: curr.met } : { published: 0, goal: 0, met: false },
    });
  }
  return { previousYear: years[0], currentYear: years[1], months };
}
/** Conquistas intermediárias: trimestres e semestres completos por ano.
 * Um trimestre (Q1=jan–mar, Q2=abr–jun, Q3=jul–set, Q4=out–dez) é completo
 * quando todos os seus meses (já passados ou com meta configurada) cumpriram
 * a meta; um semestre (H1=jan–jun, H2=jul–dez) é completo quando os 6 meses
 * cumpriram a meta. Meses futuros do ano corrente não entram no cálculo.
 * Rodada 26. */
export async function getIntermediateAchievements(
  userId: number
): Promise<{
  quarters: { year: number; quarter: 1 | 2 | 3 | 4; label: string; metMonths: number; published: number; annualGoal: number }[];
  halfYears: { year: number; half: 1 | 2; label: string; metMonths: number; published: number; annualGoal: number }[];
  yearsChecked: number;
}> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const quarters: Awaited<ReturnType<typeof getIntermediateAchievements>>["quarters"] = [];
  const halfYears: Awaited<ReturnType<typeof getIntermediateAchievements>>["halfYears"] = [];
  let yearsChecked = 0;
  for (let y = currentYear; y >= 2020; y -= 1) {
    yearsChecked += 1;
    const summary = await getYearSummary(userId, y);
    const byMonth = new Map(summary.months.map((m) => [m.monthKey, m]));
    const quarterMonths: [number, number][] = [
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 12],
    ];
    quarterMonths.forEach(([start, end], qi) => {
      const ms: (typeof summary.months)[number][] = [];
      for (let m = start; m <= end; m += 1) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        const mm = byMonth.get(key);
        if (mm) ms.push(mm);
      }
      // Trimestre completo: todos os meses contabilizados cumpriram a meta e há ao menos um mês com meta configurada
      const metMonths = ms.filter((m) => m.met).length;
      const published = ms.reduce((s, m) => s + m.publishedThisMonth, 0);
      const annualGoal = ms.reduce((s, m) => s + m.goal, 0);
      if (ms.length > 0 && ms.some((m) => m.goal > 0) && metMonths === ms.length) {
        quarters.push({ year: y, quarter: (qi + 1) as 1 | 2 | 3 | 4, label: `${y} · ${["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"][qi]}`, metMonths, published, annualGoal });
      }
    });
    const halfMonths: [number, number][] = [
      [1, 6],
      [7, 12],
    ];
    halfMonths.forEach(([start, end], hi) => {
      const ms: (typeof summary.months)[number][] = [];
      for (let m = start; m <= end; m += 1) {
        const key = `${y}-${String(m).padStart(2, "0")}`;
        const mm = byMonth.get(key);
        if (mm) ms.push(mm);
      }
      const metMonths = ms.filter((m) => m.met).length;
      const published = ms.reduce((s, m) => s + m.publishedThisMonth, 0);
      const annualGoal = ms.reduce((s, m) => s + m.goal, 0);
      if (ms.length === 6 && metMonths === 6) {
        halfYears.push({ year: y, half: (hi + 1) as 1 | 2, label: `${y} · ${hi === 0 ? "1º semestre" : "2º semestre"}`, metMonths, published, annualGoal });
      }
    });
  }
  return { quarters, halfYears, yearsChecked };
}
/** Aplicar a meta sugerida (média dos últimos 6 meses, arredondada para cima)
 * na meta do mês corrente. Reutiliza a validação de setMonthlyGoal. Rodada 26. */
export async function applySuggestedGoal(
  userId: number,
  suggestedGoal: number
): Promise<{ monthKey: string; goal: number }> {
  const currentKey = monthKeyOf(new Date());
  const goal = clampGoal(suggestedGoal);
  await setPinnedMonthlyGoal(userId, currentKey, goal);
  return { monthKey: currentKey, goal };
}
function clampGoal(goal: number): number {
  const parsed = parseInt(String(goal), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed > 100 ? 100 : parsed;
}

// ---------------------------------------------------------------------------
// (Rodada 32) Configurações de providers por usuário.
// Permite provedores alternativos (Groq, OpenRouter, endpoints custom) sem
// alterar as envs do servidor. Valor vazio/removido = padrão do servidor.
// ---------------------------------------------------------------------------

export type ProviderSettings = {
  llmApiBase?: string;
  llmApiKey?: string;
  llmModel?: string;
  imageApiKey?: string;
  imageModel?: string;
};

export const PROVIDER_SETTING_KEYS = [
  "llm_api_base",
  "llm_api_key",
  "llm_model",
  "image_api_key",
  "image_model",
] as const;

/** Lê todas as configurações de providers do usuário (mapa key → value). */
export async function getProviderSettings(
  userId: number
): Promise<ProviderSettings> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select({ settingKey: userSettings.settingKey, value: userSettings.value })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .then(rows => rows.filter(r => (PROVIDER_SETTING_KEYS as readonly string[]).includes(r.settingKey)));

  const result: ProviderSettings = {};
  rows.forEach(r => {
    const v = r.value ?? "";
    if (v.trim().length === 0) return;
    switch (r.settingKey) {
      case "llm_api_base":
        result.llmApiBase = v.trim();
        break;
      case "llm_api_key":
        result.llmApiKey = v.trim();
        break;
      case "llm_model":
        result.llmModel = v.trim();
        break;
      case "image_api_key":
        result.imageApiKey = v.trim();
        break;
      case "image_model":
        result.imageModel = v.trim();
        break;
    }
  });
  return result;
}

// ---------- Exportação CSV do histórico de análises ----------
/** Monta o conteúdo CSV do histórico de análises com resumo de retentativas (Rodada 35). */
export function buildAnalysisHistoryCsv(
  rows: Array<{
    id: string;
    niche: string;
    status: string;
    result: string | null;
    retryLog: string | null;
    createdAt: Date;
  }>
): string {
  const header = [
    "Data",
    "Nicho",
    "Status",
    "Tentativas",
    "Falhas",
    "Desistiu",
    "Score médio",
    "Títulos das sugestões",
  ].join(";");
  const body = rows.map((r) => {
    const summary = parseRetrySummary(r.retryLog);
    let parsed: { suggestions?: Array<{ title?: string; viralityScore?: number }> } | null = null;
    try {
      if (r.result) parsed = JSON.parse(r.result) as { suggestions?: Array<{ title?: string; viralityScore?: number }> };
    } catch {
      parsed = null;
    }
    const titles = (parsed?.suggestions ?? []).map((s) => s.title ?? "").join(" |");
    const scores = (parsed?.suggestions ?? []).map((s) => (typeof s?.viralityScore === "number" ? s.viralityScore : ""));
    const avgScore =
      scores.length > 0 && scores.every((v) => typeof v === "number")
        ? String(Math.round(scores.reduce((a, b) => (a as number) + (b as number), 0) / scores.length))
        : "";
    const cell = (value: string) => {
      // Escape padrão CSV: aspas internas viram aspas duplas (""), e o campo é envolto em aspas
      const escaped = value.split('"').join('""');
      return /[;\n"]/.test(value) ? '"' + escaped + '"' : value;
    };
    return [
      cell(new Date(r.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })),
      cell(r.niche),
      cell(statusLabel(r.status)),
      String(summary?.attempts ?? 0),
      String(summary?.failures ?? 0),
      cell(summary?.gaveUp ? "Sim" : "Não"),
      cell(avgScore),
      cell(titles),
    ].join(";");
  });
  return [header, ...body].join("\n");
}

function statusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Concluída";
    case "running":
      return "Em andamento";
    case "failed":
      return "Falhou";
    default:
      return status;
  }
}

// ---------- Rastreamento de consumo de APIs ----------
// ---------- (Rodada 36) Limites diários por usuário (proteção de custos) ----------
export type UserLimits = {
  dailyAnalysisLimit: number;
  dailyTokenLimit: number;
  dailyQuotaLimit: number;
  /** (Rodada 37) "block" = bloqueia em 100%; "warn" = pede confirmação (apenas-avisar) */
  limitAction: "block" | "warn";
  weeklyTokenLimit: number;
  weeklyQuotaLimit: number;
  monthlyTokenLimit: number;
  monthlyQuotaLimit: number;
  /** (Rodada 37) Override manual válido até (epoch ms; 0 ou ausente = sem override) */
  overrideUntil?: number;
};
export type UsageStatus = {
  scopes: Record<string, { tokens: number; units: number; requests: number }>;
  /** Total agregado do dia corrente, por escopo. */
  aggregated: { llm: { tokens: number; units: number; requests: number }; youtube: { tokens: number; units: number; requests: number } };
};
export type DailyPoint = { date: string; tokens: number; units: number; requests: number };
export type UsageDailySeries = {
  llm: DailyPoint[];
  youtube: DailyPoint[];
  limitByDay: Array<{ date: string; analyses: number; tokens: number; quota: number }>;
};
export type LimitStatus = {
  limit: UserLimits;
  today: { analyses: number; tokens: number; quota: number };
  /** analyses/tokens/quota: "ok" | "warn" (>=80%) | "blocked" (>=100%) */
  state: { analyses: "ok" | "warn" | "blocked"; tokens: "ok" | "warn" | "blocked"; quota: "ok" | "warn" | "blocked" };
};
/** Retorna os limites do usuário (0 = ilimitado). */
export async function getUserLimits(userId: number): Promise<UserLimits> {
  const db = await getDb();
  const empty: UserLimits = {
    dailyAnalysisLimit: 0,
    dailyTokenLimit: 0,
    dailyQuotaLimit: 0,
    limitAction: "block",
    weeklyTokenLimit: 0,
    weeklyQuotaLimit: 0,
    monthlyTokenLimit: 0,
    monthlyQuotaLimit: 0,
  };
  if (!db) return empty;
  const row = await db.select().from(userLimits).where(eq(userLimits.userId, userId)).limit(1);
  if (!row.length) return empty;
  const r = row[0];
  return {
    dailyAnalysisLimit: r.dailyAnalysisLimit ?? 0,
    dailyTokenLimit: r.dailyTokenLimit ?? 0,
    dailyQuotaLimit: r.dailyQuotaLimit ?? 0,
    limitAction: r.limitAction === "warn" ? "warn" : "block",
    weeklyTokenLimit: r.weeklyTokenLimit ?? 0,
    weeklyQuotaLimit: r.weeklyQuotaLimit ?? 0,
    monthlyTokenLimit: r.monthlyTokenLimit ?? 0,
    monthlyQuotaLimit: r.monthlyQuotaLimit ?? 0,
    overrideUntil: r.overrideUntil ?? 0,
  };
}
/** Salva os limites diários do usuário (transação upsert simples). */
export async function setUserLimits(userId: number, limits: UserLimits): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const clamped = {
    dailyAnalysisLimit: Math.max(0, Math.floor(limits.dailyAnalysisLimit ?? 0)),
    dailyTokenLimit: Math.max(0, Math.floor(limits.dailyTokenLimit ?? 0)),
    dailyQuotaLimit: Math.max(0, Math.floor(limits.dailyQuotaLimit ?? 0)),
    limitAction: limits.limitAction === "warn" ? ("warn" as const) : ("block" as const),
    weeklyTokenLimit: Math.max(0, Math.floor(limits.weeklyTokenLimit ?? 0)),
    weeklyQuotaLimit: Math.max(0, Math.floor(limits.weeklyQuotaLimit ?? 0)),
    monthlyTokenLimit: Math.max(0, Math.floor(limits.monthlyTokenLimit ?? 0)),
    monthlyQuotaLimit: Math.max(0, Math.floor(limits.monthlyQuotaLimit ?? 0)),
  };
  await db
    .insert(userLimits)
    .values({ ...clamped, userId, updatedAt: Date.now() })
    .onDuplicateKeyUpdate({ set: { ...clamped, updatedAt: Date.now() } });
}
/** (Rodada 37) Registro manual de confirmação: libera o bloqueio diário até a
 * meia-noite do servidor. Retorna o override gerado (epoch de validação). */
export async function confirmLimitOverride(userId: number): Promise<{ overrideUntil: number }> {
  const db = await getDb();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const overrideUntil = midnight.getTime();
  if (db) {
    await db
      .insert(userLimits)
      .values({
        userId,
        updatedAt: Date.now(),
        overrideUntil,
        limitAction: "block",
        dailyAnalysisLimit: 0,
        dailyTokenLimit: 0,
        dailyQuotaLimit: 0,
        weeklyTokenLimit: 0,
        weeklyQuotaLimit: 0,
        monthlyTokenLimit: 0,
        monthlyQuotaLimit: 0,
      })
      .onDuplicateKeyUpdate({ set: { overrideUntil, updatedAt: Date.now() } });
  }
  return { overrideUntil };
}
/** (Rodada 37) Registra uma tentativa bloqueada (ou confirmada depois) pelos limites. */
export async function recordBlockedAttempt(input: InsertBlockedAttempt): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(blockedAttempts).values(input);
}
/** Atualiza uma tentativa bloqueada com a confirmação do usuário. */
export async function confirmBlockedAttempt(
  id: number,
  patch: { confirmedAt: number; analysisId?: string; overrideId?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(blockedAttempts).set({ ...patch }).where(eq(blockedAttempts.id, id));
}
/** Histórico de tentativas bloqueadas (mais recentes primeiro). */
export async function getBlockedAttempts(userId: number, limit = 50): Promise<
  Array<{
    id: number;
    dimension: string;
    limitValue: number;
    currentUsage: number;
    reason: string | null;
    attemptedAt: number;
    niche: string | null;
    confirmedAt: number | null;
    analysisId: string | null;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: blockedAttempts.id,
      dimension: blockedAttempts.dimension,
      limitValue: blockedAttempts.limitValue,
      currentUsage: blockedAttempts.currentUsage,
      reason: blockedAttempts.reason,
      attemptedAt: blockedAttempts.attemptedAt,
      niche: blockedAttempts.niche,
      confirmedAt: blockedAttempts.confirmedAt,
      analysisId: blockedAttempts.analysisId,
    })
    .from(blockedAttempts)
    .where(eq(blockedAttempts.userId, userId))
    .orderBy(desc(blockedAttempts.id))
    .limit(limit);
  return rows;
}
/** Conta análises (qualquer status) realizadas pelo usuário hoje. */
export async function countAnalysesToday(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const endOfDay = new Date(new Date().setHours(23, 59, 59, 999));
  const rows = await db
    .select({ id: analyses.id })
    .from(analyses)
    .where(and(eq(analyses.userId, userId), gte(analyses.createdAt, startOfDay), lte(analyses.createdAt, endOfDay)));
  return rows.length;
}
/** Consumo agregado de hoje por escopo (llm/youtube). */
export async function getTodayUsage(userId: number): Promise<{ llm: { tokens: number; units: number; requests: number }; youtube: { tokens: number; units: number; requests: number } }> {
  const db = await getDb();
  const empty = { tokens: 0, units: 0, requests: 0 };
  const result = { llm: { ...empty }, youtube: { ...empty } };
  if (!db) return result;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(apiUsage).where(and(eq(apiUsage.userId, String(userId)), eq(apiUsage.usageDate, today)));
  for (const row of rows) {
    const scope = row.scope === "llm" ? "llm" : row.scope === "youtube" ? "youtube" : null;
    if (!scope) continue;
    result[scope].tokens += row.tokens ?? 0;
    result[scope].units += row.units ?? 0;
    result[scope].requests += row.requests ?? 0;
  }
  return result;
}
/** Avalia o estado dos limites (ok / warn >=80% / blocked >=100%) contra o consumo de hoje. */
export async function getLimitStatus(userId: number): Promise<LimitStatus> {
  const [limit, today] = await Promise.all([getUserLimits(userId), getTodayUsage(userId)]);
  const analyses = await countAnalysesToday(userId);
  const quotaUnits = (today.llm.units ?? 0) + (today.youtube.units ?? 0);
  const evaluate = (value: number, cap: number): "ok" | "warn" | "blocked" => {
    if (!cap) return "ok";
    return value >= cap ? "blocked" : value >= Math.floor(cap * 0.8) ? "warn" : "ok";
  };
  const daily: UserLimits = {
    dailyAnalysisLimit: limit.dailyAnalysisLimit,
    dailyTokenLimit: limit.dailyTokenLimit,
    dailyQuotaLimit: limit.dailyQuotaLimit,
    limitAction: limit.limitAction,
    weeklyTokenLimit: limit.weeklyTokenLimit,
    weeklyQuotaLimit: limit.weeklyQuotaLimit,
    monthlyTokenLimit: limit.monthlyTokenLimit,
    monthlyQuotaLimit: limit.monthlyQuotaLimit,
  };
  return {
    limit: daily,
    today: { analyses, tokens: today.llm.tokens, quota: quotaUnits },
    state: {
      analyses: evaluate(analyses, limit.dailyAnalysisLimit),
      tokens: evaluate(today.llm.tokens, limit.dailyTokenLimit),
      quota: evaluate(quotaUnits, limit.dailyQuotaLimit),
    },
  };
}
/** (Rodada 37) Consumo agregado por período estendido: inclui semana/mês e cota total. */
export type UsageBudgets = {
  /** Consumido + limite nos horizontes semana/mês (tokens e cota combinados) */
  week: { tokens: number; quota: number };
  month: { tokens: number; quota: number };
  weekStartIso: string;
  monthStartIso: string;
};
/** Agrega tokens/quota consumidos na semana (últimos 7 dias) e mês (1º dia → hoje). */
export async function getUsageBudgets(userId: number): Promise<UsageBudgets> {
  const db = await getDb();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const monthStart = new Date(now);
  monthStart.setDate(1);
  const empty = { tokens: 0, quota: 0 };
  const result: UsageBudgets = {
    week: { ...empty },
    month: { ...empty },
    weekStartIso: weekStart.toISOString().slice(0, 10),
    monthStartIso: monthStart.toISOString().slice(0, 10),
  };
  if (!db) return result;
  const weekIso = result.weekStartIso;
  const monthIso = result.monthStartIso;
  const rows = await db.select().from(apiUsage).where(and(eq(apiUsage.userId, String(userId)), gte(apiUsage.usageDate, monthIso)));
  for (const row of rows) {
    const unit = (row.units ?? 0) + (row.tokens ?? 0);
    if (row.usageDate >= weekIso) {
      result.week.tokens += row.tokens ?? 0;
      result.week.quota += unit;
    }
    result.month.tokens += row.tokens ?? 0;
    result.month.quota += unit;
  }
  return result;
}
/** (Rodada 37) Consumo atual na dimensão que disparou o bloqueio (para registro
 * da tentativa em blocked_attempts). */
export async function getUsageForBlock(
  userId: number,
  dimension: "analyses" | "tokens" | "quota"
): Promise<number> {
  if (dimension === "analyses") return await countAnalysesToday(userId);
  const today = await getTodayUsage(userId);
  if (dimension === "tokens") return today.llm.tokens ?? 0;
  return (today.llm.units ?? 0) + (today.youtube.units ?? 0);
}

/** (Rodada 37) Projeção de esgotamento do limite semanal/mensal pelo ritmo médio
 * diário do período. Retorna null quando o ritmo médio é zero ou o limite é ilimitado. */
export function projectExhaustion(input: {
  consumed: number;
  cap: number;
  /** Dia 1 da janela (ISO) para calcular dias corridos */
  windowStartIso: string;
  todayIso: string;
}): { exhausted: boolean; estimatedDayIso: string | null; daysLeft: number | null; pct: number } {
  const { consumed, cap, windowStartIso, todayIso } = input;
  if (!cap) return { exhausted: false, estimatedDayIso: null, daysLeft: null, pct: 0 };
  const daysInWindow = Math.max(1, Math.floor((new Date(todayIso).getTime() - new Date(windowStartIso).getTime()) / 86_400_000) + 1);
  const remaining = cap - consumed;
  const pct = Math.min(100, Math.round((consumed / cap) * 100));
  if (remaining <= 0) return { exhausted: true, estimatedDayIso: todayIso, daysLeft: 0, pct };
  const avgDaily = consumed / daysInWindow;
  if (avgDaily <= 0) return { exhausted: false, estimatedDayIso: null, daysLeft: null, pct };
  const daysLeftRaw = Math.ceil(remaining / avgDaily) - 1;
  const target = new Date(new Date(todayIso + "T00:00:00Z").getTime() + daysLeftRaw * 86_400_000);
  return { exhausted: false, estimatedDayIso: target.toISOString().slice(0, 10), daysLeft: daysLeftRaw, pct };
}
/**
 * Verifica se uma nova análise diária seria bloqueada pelos limites do dia.
 * Retorna { blocked: true, reason } quando qualquer limite atingiu 100%;
 * { needsConfirmation: true } quando o usuário escolheu o modo "apenas avisar"
 * (limitAction "warn") e algum limite diário atingiu 100%.
 * O overrideUntil (confirmação manual) suspende o bloqueio até a meia-noite.
 */
export async function checkAnalysisLimits(userId: number): Promise<
  | { blocked: false }
  | { blocked: true; reason: string; dimension: "analyses" | "tokens" | "quota" }
  | { needsConfirmation: true; reason: string; dimension: "analyses" | "tokens" | "quota" }
> {
  const { limit, today, state } = await getLimitStatus(userId);
  const limits = await getUserLimits(userId);
  const hasOverride = (limits.overrideUntil ?? 0) >= Date.now();
  const blockedDims: Array<{ dimension: "analyses" | "tokens" | "quota"; reason: string }> = [];
  if (!hasOverride && limit.dailyAnalysisLimit > 0 && today.analyses >= limit.dailyAnalysisLimit) {
    blockedDims.push({ dimension: "analyses", reason: `Limite de análises do dia (${limit.dailyAnalysisLimit}) atingido. O contador zera à meia-noite.` });
  }
  if (!hasOverride && limit.dailyTokenLimit > 0 && state.tokens === "blocked") {
    blockedDims.push({ dimension: "tokens", reason: `Limite diário de tokens de LLM (${limit.dailyTokenLimit.toLocaleString("pt-BR")}) atingido. O contador zera à meia-noite.` });
  }
  if (!hasOverride && limit.dailyQuotaLimit > 0 && state.quota === "blocked") {
    blockedDims.push({ dimension: "quota", reason: `Limite diário de cota YouTube (${limit.dailyQuotaLimit.toLocaleString("pt-BR")} unidades) atingido. O contador zera à meia-noite.` });
  }
  if (!blockedDims.length) return { blocked: false };
  if (limits.limitAction === "warn") {
    return { needsConfirmation: true, ...blockedDims[0] };
  }
  return { blocked: true, ...blockedDims[0] };
}
/** Série diária (últimos `days` dias) de consumo llm/youtube + limites por dia. */
export async function getUsageDailySeries(userId: number, days = 30): Promise<UsageDailySeries> {
  const db = await getDb();
  const empty: DailyPoint[] = [];
  const series: UsageDailySeries = { llm: empty, youtube: empty, limitByDay: [] };
  if (!db) return series;
  const today = new Date();
  const rows = await db.select().from(apiUsage).where(eq(apiUsage.userId, String(userId)));
  const byScopeDay = new Map<string, { tokens: number; units: number; requests: number }>();
  for (const row of rows) {
    const scope = row.scope === "llm" || row.scope === "youtube" ? row.scope : null;
    if (!scope) continue;
    const key = `${scope}|${row.usageDate}`;
    const prev = byScopeDay.get(key) ?? { tokens: 0, units: 0, requests: 0 };
    byScopeDay.set(key, {
      tokens: prev.tokens + (row.tokens ?? 0),
      units: prev.units + (row.units ?? 0),
      requests: prev.requests + (row.requests ?? 0),
    });
  }
  const limit = await getUserLimits(userId);
  const points: DailyPoint[] = [];
  const limitByDay: Array<{ date: string; analyses: number; tokens: number; quota: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const llmKey = `llm|${iso}`;
    const ytKey = `youtube|${iso}`;
    const llm = byScopeDay.get(llmKey) ?? { tokens: 0, units: 0, requests: 0 };
    const yt = byScopeDay.get(ytKey) ?? { tokens: 0, units: 0, requests: 0 };
    points.push({ date: iso, tokens: llm.tokens, units: llm.units, requests: llm.requests });
    series.llm.push({ date: iso, ...llm });
    series.youtube.push({ date: iso, ...yt });
    limitByDay.push({ date: iso, analyses: limit.dailyAnalysisLimit, tokens: limit.dailyTokenLimit, quota: limit.dailyQuotaLimit });
  }
  series.limitByDay = limitByDay;
  return series;
}
export type UsagePeriod = { tokens: number; units: number; requests: number };
export type UsageSummary = {
  llm: { today: UsagePeriod; week: UsagePeriod; month: UsagePeriod };
  youtube: { today: UsagePeriod; week: UsagePeriod; month: UsagePeriod };
};
/** Incrementa o consumo de um escopo (llm/youtube) para o usuário no dia informado. */
export async function recordApiUsage(input: {
  userId: number;
  scope: "llm" | "youtube";
  tokens?: number;
  units?: number;
  requests?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(apiUsage)
    .values({
      userId: String(input.userId),
      scope: input.scope,
      usageDate: today,
      tokens: Math.max(0, input.tokens ?? 0),
      units: Math.max(0, input.units ?? 0),
      requests: Math.max(0, input.requests ?? 0),
      updatedAt: Date.now(),
    })
    .onDuplicateKeyUpdate({
      set: {
        tokens: sql`tokens + VALUES(tokens)`,
        units: sql`units + VALUES(units)`,
        requests: sql`requests + VALUES(requests)`,
        updatedAt: Date.now(),
      },
    });
}

/** Agrega o consumo por escopo nos períodos hoje/semana/mês. */
export async function getUsageSummary(userId: number): Promise<UsageSummary> {
  const db = await getDb();
  const empty: UsagePeriod = { tokens: 0, units: 0, requests: 0 };
  const emptyPeriods = { today: { ...empty }, week: { ...empty }, month: { ...empty } };
  const result: UsageSummary = { llm: { ...emptyPeriods }, youtube: { ...emptyPeriods } };
  if (!db) return result;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 6);
  const monthStart = new Date(now); monthStart.setDate(1);
  const rows = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.userId, String(userId)));
  for (const row of rows) {
    const [scope, period] = pickScopePeriod(row.scope, row.usageDate, today, weekStart.toISOString().slice(0, 10), monthStart.toISOString().slice(0, 10));
    if (!scope || !period) continue;
    result[scope][period].tokens += row.tokens ?? 0;
    result[scope][period].units += row.units ?? 0;
    result[scope][period].requests += row.requests ?? 0;
  }
  return result;
}

function pickScopePeriod(
  scope: string,
  usageDate: string,
  today: string,
  weekStart: string,
  monthStart: string
): ["llm" | "youtube", "today" | "week" | "month"] | [null, null] {
  if (scope !== "llm" && scope !== "youtube") return [null, null];
  if (usageDate === today) return [scope, "today"];
  if (usageDate >= weekStart) return [scope, "week"];
  if (usageDate >= monthStart) return [scope, "month"];
  return [null, null];
}

/** Persiste o mapa completo de configurações de providers do usuário. */
export async function setProviderSettings(
  userId: number,
  settings: ProviderSettings
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const pairs: Array<[string, string | null]> = [
    ["llm_api_base", settings.llmApiBase ?? null],
    ["llm_api_key", settings.llmApiKey ?? null],
    ["llm_model", settings.llmModel ?? null],
    ["image_api_key", settings.imageApiKey ?? null],
    ["image_model", settings.imageModel ?? null],
  ];

  for (const [key, value] of pairs) {
    if (value === null || value.trim().length === 0) {
      await db
        .delete(userSettings)
        .where(
          and(eq(userSettings.userId, userId), eq(userSettings.settingKey, key))
        );
    } else {
      await db
        .insert(userSettings)
        .values({ userId, settingKey: key, value: value.trim() })
        .onDuplicateKeyUpdate({ set: { value: value.trim() } });
    }
  }
}
