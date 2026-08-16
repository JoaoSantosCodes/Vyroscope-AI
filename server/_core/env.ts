export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // --- Providers próprios (Rodada 31) — para deploy fora da Manus (Vercel etc.) ---
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiApiBase: process.env.OPENAI_API_BASE ?? "https://api.openai.com/v1",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o",
  imageModel: process.env.IMAGE_MODEL ?? "dall-e-3",
  youtubeApiKey: process.env.YOUTUBE_DATA_API_KEY ?? "",
};
