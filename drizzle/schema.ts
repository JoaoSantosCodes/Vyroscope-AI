import { bigint, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

// Nota: o banco usa text() no modelo (máx. ~64KB) — suficiente para o log de
// retentativas; a coluna real no banco é MEDIUMTEXT via migração SQL manual.

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
// ---------------------------------------------------------------------------
// (Rodada 36) Limites diários opcionais por usuário (proteção de custos).
// 0 = ilimitado. Valores em user_limits (migração 0018).
// ---------------------------------------------------------------------------
export const userLimits = mysqlTable("user_limits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  dailyAnalysisLimit: int("daily_analysis_limit").notNull().default(0),
  dailyTokenLimit: int("daily_token_limit").notNull().default(0),
  dailyQuotaLimit: int("daily_quota_limit").notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const apiUsage = mysqlTable("api_usage", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  scope: varchar("scope", { length: 32 }).notNull(),
  usageDate: varchar("usage_date", { length: 10 }).notNull(),
  tokens: int("tokens").notNull().default(0),
  units: int("units").notNull().default(0),
  requests: int("requests").notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

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
  /**
   * (Rodada 31) Hash SHA-256 do código secreto pessoal do usuário local.
   * Quando definido (via perfil), sobrepõe o AUTH_SECRET_CODE global para
   * aquele usuário. Armazenado como hash — o código em si nunca é persistido.
   */
  localCodeHash: varchar("localCodeHash", { length: 64 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * (Rodada 32) Configurações de providers por usuário.
 * Permite escolher provedores alternativos de LLM/imagem (Groq, OpenRouter,
 * endpoints custom) sem alterar as envs do servidor. Chaves conhecidas:
 * `llm_api_base`, `llm_api_key`, `llm_model`, `image_api_key`, `image_model`.
 * Valor vazio/nulo significa "usar o padrão do servidor/env".
 */
export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  settingKey: varchar("settingKey", { length: 64 }).notNull(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Índice composto (userId, settingKey) para leitura rápida das configurações por usuário.
export const userSettingsUserKeyIndex = index("idx_user_settings_user_key").on(
  userSettings.userId,
  userSettings.settingKey
);

export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = typeof userSettings.$inferInsert;

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
  /** (Rodada 33) Log JSON das retentativas do YouTube durante a coleta */
  retryLog: text("retryLog"),
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
  /** Status de produção da ideia: planejada, gravando, publicada */
  status: varchar("status", { length: 10 }).default("planejada").notNull(),
  /** Momento em que a ideia entrou no status atual (usado para detectar estagnação) */
  statusChangedAt: timestamp("statusChangedAt").defaultNow().notNull(),
  /** Ideia arquivada (0 = ativa no quadro, 1 = arquivada fora do quadro) */
  archived: int("archived").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PinnedIdeaHistory = typeof pinnedIdeaHistory.$inferSelect;
export type InsertPinnedIdeaHistory = typeof pinnedIdeaHistory.$inferInsert;

/**
 * Meta mensal de publicações por usuário. Uma meta por mês (YYYY-MM);
 * quando não existe registro, a aplicação usa a meta padrão (DEFAULT_MONTHLY_GOAL).
 */
export const pinnedMonthlyGoal = mysqlTable("pinned_monthly_goal", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Mês da meta no formato YYYY-MM */
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  /** Quantidade de publicações planejadas para o mês */
  goal: int("goal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PinnedMonthlyGoal = typeof pinnedMonthlyGoal.$inferSelect;
export type InsertPinnedMonthlyGoal = typeof pinnedMonthlyGoal.$inferInsert;

/**
 * Celebrações de meta cumprida por mês (rodada 23). Registra no servidor quando
 * o progresso da meta de um mês atinge 100% pela primeira vez, permitindo
 * rever a animação de confetes pela página de metas independentemente de
 * sessionStorage.
 */
export const goalCelebrations = mysqlTable("goal_celebrations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Mês da meta celebrada (YYYY-MM) */
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  /** Meta que foi atingida quando celebrada */
  goal: int("goal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GoalCelebration = typeof goalCelebrations.$inferSelect;
export type InsertGoalCelebration = typeof goalCelebrations.$inferInsert;

/**
 * Histórico de sugestões de metas geradas pela IA (rodada 23). Cada chamada a
 * suggestMonthlyGoal é registrada com a justificativa, os fatores e se a meta
 * sugerida foi aplicada ou descartada, para revisão futura.
 */
export const goalSuggestions = mysqlTable("goal_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Mês alvo da sugestão (YYYY-MM) */
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  /** Meta sugerida pela IA (1–100) */
  suggestedGoal: int("suggestedGoal").notNull(),
  /** Justificativa retornada pela IA */
  reason: text("reason"),
  /** Fatores considerados (JSON array de strings) */
  factors: text("factors"),
  /** Meta aplicada de fato (1 = aplicada via setMonthlyGoal, 0 = descartada/não aplicada) */
  applied: int("applied").default(0).notNull(),
  /** Meta mantida porque já existia para o mês (rodada 22: keepExisting) */
  keepExisting: int("keepExisting").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GoalSuggestion = typeof goalSuggestions.$inferSelect;
export type InsertGoalSuggestion = typeof goalSuggestions.$inferInsert;
