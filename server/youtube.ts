import { callDataApi } from "./_core/dataApi";

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
  const searchRes = (await callDataApi("Youtube/search", {
    query: {
      part: "snippet",
      type: "video",
      q: `${niche} trending`,
      maxResults: 20,
      order: "viewCount",
      publishedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    },
  })) as { items?: { id?: string | { videoId?: string }; snippet?: SearchSnippet }[] };

  const videoIds = (searchRes.items ?? [])
    .map((item) => (typeof item.id === "string" ? item.id : item.id?.videoId))
    .filter((id): id is string => typeof id === "string");

  if (videoIds.length === 0) {
    throw new Error("no_videos_found");
  }

  const detailsRes = (await callDataApi("Youtube/videos", {
    query: {
      part: "snippet,contentDetails,statistics",
      id: videoIds.slice(0, 20).join(","),
    },
  })) as { items?: VideoDetail[] };

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
    const detailsRes = (await callDataApi("Youtube/videos", {
      query: {
        part: "snippet,statistics",
        id: videoId,
      },
    })) as { items?: VideoDetail[] };

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
