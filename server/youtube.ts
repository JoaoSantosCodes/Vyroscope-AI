import { callDataApi } from "./_core/dataApi";
import { ENV } from "./_core/env";

// --- Provider próprio do YouTube Data API v3 (Rodada 31) ---
// Quando YOUTUBE_DATA_API_KEY está definida (deploy fora da Manus), as buscas
// vão direto ao endpoint público do Google; caso contrário, usa o hub de dados
// interno da Manus (callDataApi).

const useDirectProvider = () =>
  ENV.youtubeApiKey !== undefined && ENV.youtubeApiKey.trim().length > 0;

const DIRECT_BASE = "https://www.googleapis.com/youtube/v3";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * (Rodada 32) Busca com retry para erros transitórios:
 *   - 429: respeita o Retry-After (ou backoff de 10s);
 *   - 5xx: backoff exponencial (1s, 2s, 4s);
 *   - erros de rede (fetch lançando): mesma estratégia.
 * Erros permanentes (400/401/403) propagam imediatamente.
 */
async function fetchJson(url: string): Promise<unknown> {
  const RETRY_MAX = 3;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      // Erro de rede — transitório se ainda houver tentativas
      lastError = new Error(
        `youtube_network_error (${err instanceof Error ? err.message : "unknown"})`
      );
      if (attempt < RETRY_MAX) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw lastError;
    }
    if (response.ok) {
      return response.json();
    }
    const detail = await response.text().catch(() => "");
    const status = response.status;
    // Erros permanentes propagam imediatamente
    if (status === 403) {
      throw new Error(
        `youtube_quota_or_key (${status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
    }
    if (status === 400 || status === 401) {
      throw new Error(
        `youtube_invalid_key (${status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
    }
    // Transitórios: 429 (quota diária momentânea) e 5xx
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    const wait = status === 429 ? Math.max(2, retryAfter || 10) : Math.pow(2, attempt) * 1000;
    if (attempt < RETRY_MAX) {
      await sleep(Math.min(wait, 30_000));
      continue;
    }
    throw new Error(
      `youtube_request_failed (${status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }
  throw lastError ?? new Error("youtube_request_failed");
}

const buildDirectUrl = (
  endpoint: string,
  params: Record<string, string | number>
) => {
  const url = new URL(`${DIRECT_BASE}/${endpoint}`);
  url.searchParams.set("key", ENV.youtubeApiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
};

export type VideoItem = {
  id: string;
  title: string;
  channelTitle: string | null;
  description: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  thumbnailUrl: string | null;
};

type SearchSnippet = {
  channelId?: string;
  channelTitle?: string;
  description?: string;
  publishedAt?: string;
  title?: string;
  thumbnails?: Record<string, { url?: string }>;
};

type VideoStatistic = {
  commentCount?: string;
  likeCount?: string;
  viewCount?: string;
};

type VideoDetail = {
  id?: string;
  snippet?: SearchSnippet;
  contentDetails?: { duration?: string };
  statistics?: VideoStatistic;
};

/**
 * Busca vídeos relevantes ao nicho na YouTube Data API (hub de dados) e
 * enriquece com estatísticas e duração, priorizando vídeos recentes e de alta
 * performance (ordenados por visualizações).
 */
export async function fetchTrendingVideosForNiche(
  niche: string,
  maxResults = 12
): Promise<VideoItem[]> {
  const searchQuery = {
    part: "snippet",
    type: "video",
    q: `${niche} trending`,
    maxResults: 20,
    order: "viewCount",
    publishedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
  };

  const searchRes = useDirectProvider()
    ? ((await fetchJson(buildDirectUrl("search", {
        ...searchQuery,
        maxResults: String(searchQuery.maxResults),
      } as unknown as Record<string, string>))) as {
        items?: { id?: string | { videoId?: string }; snippet?: SearchSnippet }[];
      })
    : ((await callDataApi("Youtube/search", { query: searchQuery })) as {
        items?: { id?: string | { videoId?: string }; snippet?: SearchSnippet }[];
      });

  const videoIds = (searchRes.items ?? [])
    .map((item) => (typeof item.id === "string" ? item.id : item.id?.videoId))
    .filter((id): id is string => typeof id === "string");

  if (videoIds.length === 0) {
    throw new Error("no_videos_found");
  }

  const detailsQuery = {
    part: "snippet,contentDetails,statistics",
    id: videoIds.slice(0, 20).join(","),
  };
  const detailsRes = useDirectProvider()
    ? ((await fetchJson(buildDirectUrl("videos", detailsQuery as Record<string, string>))) as {
        items?: VideoDetail[];
      })
    : ((await callDataApi("Youtube/videos", { query: detailsQuery })) as {
        items?: VideoDetail[];
      });

  const details = detailsRes.items ?? [];

  const items = details
    .filter((d): d is VideoDetail => !!d.id && !!d.statistics)
    .map((d) => {
      const duration = parseIsoDuration(d.contentDetails?.duration ?? null);
      return {
        id: d.id!,
        title: d.snippet?.title ?? "Untitled",
        channelTitle: d.snippet?.channelTitle ?? null,
        description: d.snippet?.description ?? null,
        publishedAt: d.snippet?.publishedAt ?? null,
        durationSeconds: duration,
        viewCount: safeInt(d.statistics?.viewCount),
        likeCount: safeInt(d.statistics?.likeCount),
        commentCount: safeInt(d.statistics?.commentCount),
        thumbnailUrl:
          d.snippet?.thumbnails?.high?.url ??
          d.snippet?.thumbnails?.medium?.url ??
          d.snippet?.thumbnails?.default?.url ??
          null,
      } as VideoItem;
    })
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, maxResults);

  return items;
}

export function parseIsoDuration(iso: string | null): number | null {
  if (!iso) return null;
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!match) return null;
  const h = parseInt(match[1] ?? "0", 10);
  const m = parseInt(match[2] ?? "0", 10);
  const s = parseInt(match[3] ?? "0", 10);
  return h * 3600 + m * 60 + s;
}

export function safeInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatCompact(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/**
 * Busca estatísticas atuais de um vídeo específico pelo ID.
 */
export async function fetchVideoStatsById(
  videoId: string
): Promise<{ title: string | null; viewCount: number | null; likeCount: number | null; commentCount: number | null; publishedAt: string | null } | null> {
  try {
    const detailsQuery = { part: "snippet,statistics", id: videoId };
    const detailsRes = useDirectProvider()
      ? ((await fetchJson(buildDirectUrl("videos", detailsQuery as Record<string, string>))) as {
          items?: VideoDetail[];
        })
      : ((await callDataApi("Youtube/videos", { query: detailsQuery })) as {
          items?: VideoDetail[];
        });

    const d = (detailsRes.items ?? []).find((item) => item.id === videoId);
    if (!d?.statistics) return null;
    return {
      title: d.snippet?.title ?? null,
      viewCount: safeInt(d.statistics.viewCount),
      likeCount: safeInt(d.statistics.likeCount),
      commentCount: safeInt(d.statistics.commentCount),
      publishedAt: d.snippet?.publishedAt ?? null,
    };
  } catch {
    return null;
  }
}
