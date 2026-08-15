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