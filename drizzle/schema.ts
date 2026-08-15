import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Análises de viralidade por nicho. Cada linha representa uma análise completa
 * (busca de vídeos + padrões + sugestões) vinculada ao usuário autenticado.
 */
export const analyses = mysqlTable("analyses", {
  id: varchar("id", { length: 24 }).primaryKey(),
  userId: int("userId").notNull(),
  niche: varchar("niche", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  /** Resultado estruturado da análise (JSON): vídeos, padrões, sugestões */
  result: text("result"),
  errorMessage: text("errorMessage"),
  /** Etapa atual de progresso da análise (0-100) */
  progressStep: int("progressStep").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

/**
 * Vídeos coletados em uma análise.
 */
export const analysisVideos = mysqlTable("analysis_videos", {
  id: int("id").autoincrement().primaryKey(),
  analysisId: varchar("analysisId", { length: 24 }).notNull(),
  youtubeId: varchar("youtubeId", { length: 32 }).notNull(),
  title: text("title").notNull(),
  channelTitle: varchar("channelTitle", { length: 255 }),
  description: text("description"),
  publishedAt: varchar("publishedAt", { length: 32 }),
  durationSeconds: int("durationSeconds"),
  viewCount: int("viewCount"),
  likeCount: int("likeCount"),
  commentCount: int("commentCount"),
  thumbnailUrl: text("thumbnailUrl"),
});

export type AnalysisVideo = typeof analysisVideos.$inferSelect;
export type InsertAnalysisVideo = typeof analysisVideos.$inferInsert;

/**
 * Thumbnails geradas por IA para as sugestões de uma análise.
 */
export const suggestionThumbnails = mysqlTable("suggestion_thumbnails", {
  id: int("id").autoincrement().primaryKey(),
  analysisId: varchar("analysisId", { length: 24 }).notNull(),
  suggestionTitle: varchar("suggestionTitle", { length: 255 }).notNull(),
  imageUrl: text("imageUrl").notNull(),
  /** Prompt usado na geração (para rastreabilidade e reuso) */
  prompt: text("prompt").notNull(),
  /** Thumbnail salva na galeria de favoritos do usuário */
  favorite: int("favorite").default(0).notNull(),
  /** Pasta de organização da thumbnail (NULL = fora de pasta) */
  folderId: int("folderId"),
  /** Ordem manual de exibição (menor valor aparece primeiro; NULL = posição padrão) */
  sortOrder: int("sortOrder"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SuggestionThumbnail = typeof suggestionThumbnails.$inferSelect;
export type InsertSuggestionThumbnail = typeof suggestionThumbnails.$inferInsert;

/**
 * Vídeos publicados pelo criador, monitorados contra o score previsto.
 */
export const watchedVideos = mysqlTable("watched_videos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** ID do vídeo no YouTube (publicado pelo criador) */
  youtubeId: varchar("youtubeId", { length: 32 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  /** Título da sugestão original que deu origem ao vídeo (opcional) */
  suggestionTitle: varchar("suggestionTitle", { length: 255 }),
  /** Score de viralidade previsto quando a sugestão foi criada */
  predictedScore: int("predictedScore"),
  /** URL do vídeo publicado */
  videoUrl: text("videoUrl"),
  publishedAt: timestamp("publishedAt"),
  views: int("views").default(0).notNull(),
  likes: int("likes").default(0).notNull(),
  comments: int("comments").default(0).notNull(),
  /** Última atualização das métricas do YouTube */
  metricsUpdatedAt: timestamp("metricsUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WatchedVideo = typeof watchedVideos.$inferSelect;
export type InsertWatchedVideo = typeof watchedVideos.$inferInsert;

/**
 * Histórico de métricas dos vídeos monitorados (evolução no tempo).
 * Um ponto é gravado a cada atualização de métricas do watched.videos.list.
 */
export const watchedMetricsHistory = mysqlTable("watched_metrics_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  watchedVideoId: int("watchedVideoId").notNull(),
  views: int("views").default(0).notNull(),
  likes: int("likes").default(0).notNull(),
  comments: int("comments").default(0).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
});

export type WatchedMetricsHistory = typeof watchedMetricsHistory.$inferSelect;
export type InsertWatchedMetricsHistory = typeof watchedMetricsHistory.$inferInsert;

/**
 * Pastas da galeria de favoritos para organizar thumbnails por projeto/canal.
 */
export const thumbnailFolders = mysqlTable("thumbnail_folders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  /** Cor do rótulo da pasta (hex, opcional) */
  color: varchar("color", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ThumbnailFolder = typeof thumbnailFolders.$inferSelect;
export type InsertThumbnailFolder = typeof thumbnailFolders.$inferInsert;

/**
 * Ideias fixadas do painel "Ideia do dia". Uma ideia fica sempre visível
 * no topo do histórico enquanto estiver fixada pelo usuário.
 */
export const pinnedIdeaHistory = mysqlTable("pinned_idea_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Data da ideia rotacionada (YYYY-MM-DD) */
  date: varchar("date", { length: 10 }).notNull(),
  /** ID da análise de origem */
  analysisId: varchar("analysisId", { length: 24 }).notNull(),
  /** Título da sugestão fixada */
  suggestionTitle: varchar("suggestionTitle", { length: 255 }).notNull(),
  /** Nicho da análise no momento da fixação */
  niche: varchar("niche", { length: 120 }).notNull(),
  /** Score de viralidade no momento da fixação */
  viralityScore: int("viralityScore"),
  /** Ordem manual (menor valor aparece primeiro) */
  sortOrder: int("sortOrder"),
  /** Anotações pessoais do usuário sobre a ideia fixada */
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PinnedIdeaHistory = typeof pinnedIdeaHistory.$inferSelect;
export type InsertPinnedIdeaHistory = typeof pinnedIdeaHistory.$inferInsert;
