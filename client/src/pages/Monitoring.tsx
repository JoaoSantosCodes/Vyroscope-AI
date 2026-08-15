import SiteLayout from "@/components/SiteLayout";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatDate, scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpRight,
  Clock,
  Eye,
  Loader2,
  MessageCircle,
  Radar,
  Trash2,
  TrendingUp,
  Video,
  ThumbsUp,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{6,20}$/;

export default function Monitoring() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [youtubeInput, setYoutubeInput] = useState("");
  const [title, setTitle] = useState("");
  const [predictedScore, setPredictedScore] = useState("");

  const watchedMutation = trpc.watched.list.useMutation({
    onError: (err) => toast.error(`Não foi possível carregar os vídeos: ${err.message}`),
  });

  // Carrega os vídeos monitorados automaticamente ao abrir a página
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      watchedMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMutation = trpc.watched.add.useMutation({
    onSuccess: () => {
      toast.success("Vídeo adicionado ao monitoramento.");
      watchedMutation.mutate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.watched.remove.useMutation({
    onSuccess: () => {
      toast.success("Vídeo removido do monitoramento.");
      watchedMutation.mutate();
    },
    onError: (err) => toast.error(err.message),
  });

  const videos = watchedMutation.data ?? [];

  const handleAdd = () => {
    const input = youtubeInput.trim();
    if (!input) {
      toast.error("Informe o link ou o ID do vídeo no YouTube.");
      return;
    }
    if (!YOUTUBE_ID_REGEX.test(input) && !input.includes("youtube") && !input.includes("youtu.be")) {
      toast.error("Link ou ID de vídeo inválido.");
      return;
    }
    if (!title.trim()) {
      toast.error("Informe o título do vídeo.");
      return;
    }
    const score = predictedScore ? Number(predictedScore) : undefined;
    if (score !== undefined && (Number.isNaN(score) || score < 0 || score > 100)) {
      toast.error("O score previsto deve estar entre 0 e 100.");
      return;
    }
    addMutation.mutate({
      youtubeId: input,
      title: title.trim(),
      predictedScore: score,
    });
    setYoutubeInput("");
    setTitle("");
    setPredictedScore("");
  };

  return (
    <SiteLayout>
      <div className="container max-w-4xl py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Monitoramento</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Vídeos publicados</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Acompanhe o desempenho dos vídeos que você já publicou e compare com o score de
            viralidade previsto pela análise do nicho. As métricas são atualizadas em tempo real
            a partir do YouTube.
          </p>
        </div>

        <Card className="mb-8 border-border/60">
          <CardContent className="space-y-4 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Adicionar vídeo publicado
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="yt-input" className="text-xs text-muted-foreground">
                  Link ou ID do vídeo no YouTube
                </label>
                <Input
                  id="yt-input"
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="title-input" className="text-xs text-muted-foreground">
                  Título
                </label>
                <Input
                  id="title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Como gravar este vídeo"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="score-input" className="text-xs text-muted-foreground">
                  Score previsto pela análise (opcional, 0–100)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="score-input"
                    type="number"
                    min={0}
                    max={100}
                    value={predictedScore}
                    onChange={(e) => setPredictedScore(e.target.value)}
                    placeholder="Ex: 78"
                    className="max-w-[160px]"
                  />
                  <Button
                    onClick={handleAdd}
                    disabled={addMutation.isPending || watchedMutation.isPending}
                  >
                    {addMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Adicionar
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {watchedMutation.isPending && videos.length === 0 ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex min-h-[30vh] flex-col items-center justify-center gap-4 text-center">
            <Video className="h-10 w-10 text-muted-foreground/40" />
            <h2 className="font-display text-xl font-semibold">Nenhum vídeo monitorado</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Adicione acima o link de um vídeo que você já publicou para acompanhar o desempenho
              dele e comparar com o score previsto.
            </p>
            <Button variant="outline" onClick={() => navigate("/historico")}>
              Ver histórico de análises
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {videos.length} vídeo(s) monitorado(s)
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => watchedMutation.mutate()}
                disabled={watchedMutation.isPending}
              >
                {watchedMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Radar className="mr-2 h-4 w-4" />
                )}
                Atualizar métricas
              </Button>
            </div>
            {videos.map((v) => (
              <VideoRow
                key={v.id}
                video={v}
                onRemove={() => removeMutation.mutate({ id: v.id })}
                removeDisabled={removeMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

type WatchedRow = {
  id: number;
  youtubeId: string;
  title: string;
  suggestionTitle: string | null;
  predictedScore: number | null;
  videoUrl: string | null;
  publishedAt: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  metricsUpdatedAt: Date | null;
  performanceScore: number | null;
  refreshError: boolean | null;
};

function VideoRow({
  video,
  onRemove,
  removeDisabled,
}: {
  video: WatchedRow;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  const [chartOpen, setChartOpen] = useState(true);
  const metricsQuery = trpc.watched.metrics.useQuery({ id: video.id }, { enabled: true, refetchInterval: 0 });

  const [granularity, setGranularity] = useState<"all" | "daily">("all");

  const dailyData = useMemo(() => {
    const daily = metricsQuery.data?.daily ?? [];
    return daily.map((d) => ({
      date: d.date,
      views: d.views,
      likes: d.likes,
      comments: d.comments,
    }));
  }, [metricsQuery.data]);

  const chartData = useMemo(() => {
    if (!metricsQuery.data?.history?.length) return [];
    const points = metricsQuery.data.history.map((row) => ({
      t: row.recordedAt.getTime(),
      date: formatDate(row.recordedAt.valueOf()),
      views: row.views,
      likes: row.likes,
      comments: row.comments,
    }));
    // Deduplica leituras da mesma hora para o gráfico não plotar degraus verticais
    const dedup = new Map<number, (typeof points)[number]>();
    for (const p of points) dedup.set(Math.floor(p.t / 3600_000), p);
    return Array.from(dedup.values()).sort((a, b) => a.t - b.t);
  }, [metricsQuery.data]);

  const seriesData = granularity === "daily" && dailyData.length > 0 ? dailyData : chartData;

  const delta = useMemo(() => {
    if (video.predictedScore === null || video.performanceScore === null) return null;
    return video.performanceScore - video.predictedScore;
  }, [video.performanceScore, video.predictedScore]);

  return (
    <Card className="border-border/60 transition-colors hover:border-primary/30">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold leading-snug">{video.title}</h3>
              {video.suggestionTitle && (
                <Badge variant="outline" className="text-xs font-normal">
                  de: {video.suggestionTitle}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {formatCompact(video.views)} views</span>
              <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {formatCompact(video.likes)}</span>
              <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {formatCompact(video.comments)}</span>
              {video.metricsUpdatedAt && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> atualizado {formatDate(video.metricsUpdatedAt.valueOf())}</span>
              )}
              {video.refreshError && <span className="text-destructive">não foi possível atualizar as métricas</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <button
                type="button"
                onClick={() => setChartOpen((o) => !o)}
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
              >
                <TrendingUp className={`h-3.5 w-3.5 transition-transform duration-200 ${chartOpen ? "" : "-rotate-90"}`} />
                {seriesData.length > 1 ? `Evolução (${seriesData.length} ${granularity === "daily" ? "médias diárias" : "leituras"})` : "Evolução (aguardando leituras)"}
              </button>
              <span className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setGranularity("all")}
                  className={`rounded-md px-2 py-0.5 transition-colors ${granularity === "all" ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Todas as leituras
                </button>
                <button
                  type="button"
                  onClick={() => setGranularity("daily")}
                  className={`rounded-md px-2 py-0.5 transition-colors ${granularity === "daily" ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Médias diárias
                </button>
              </span>
              {video.performanceScore !== null && (
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full border px-2.5 py-0.5 font-bold ${scoreColor(video.performanceScore)} border-current/25 bg-accent/50`}>
                    {video.performanceScore} · {scoreLabel(video.performanceScore)}
                  </span>
                  <span className="text-muted-foreground">desempenho real</span>
                </div>
              )}
              {video.predictedScore !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-bold text-muted-foreground">
                    {video.predictedScore} previsto
                  </span>
                  {delta !== null && (
                    <span
                      className={
                        delta > 0
                          ? "flex items-center gap-0.5 font-medium text-emerald-400"
                          : delta < 0
                            ? "flex items-center gap-0.5 font-medium text-destructive"
                            : "font-medium text-muted-foreground"
                      }
                    >
                      <TrendingUp className={`h-3.5 w-3.5 ${delta < 0 ? "rotate-180" : ""}`} />
                      {delta > 0 ? "+" : ""}
                      {delta}
                      {delta > 0 ? " acima da previsão" : delta < 0 ? " abaixo da previsão" : " na previsão"}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={video.videoUrl ?? `https://www.youtube.com/watch?v=${video.youtubeId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              Abrir <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <Button variant="ghost" size="icon" onClick={onRemove} disabled={removeDisabled}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
        {chartOpen && (
          <div className="mt-4 border-t border-border/50 pt-4">
            {metricsQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : seriesData.length < 2 ? (
              <p className="flex items-center justify-center gap-2 py-6 text-center text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Atualize as métricas mais de uma vez ao longo do tempo para ver o gráfico de evolução de visualizações e curtidas.
              </p>
            ) : (
              <>
                {/* Indicadores de crescimento vs. semana anterior */}
                {metricsQuery.data?.growth && (
                  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <GrowthCard
                      label="Visualizações"
                      icon={<Eye className="h-4 w-4" />}
                      percent={metricsQuery.data.growth.viewsPercent}
                      current={metricsQuery.data.growth.lastWeekAvgViews}
                      previous={metricsQuery.data.growth.prevWeekAvgViews}
                      metricName="visualizações"
                    />
                    <GrowthCard
                      label="Curtidas"
                      icon={<ThumbsUp className="h-4 w-4" />}
                      percent={metricsQuery.data.growth.likesPercent}
                      current={metricsQuery.data.growth.lastWeekAvgLikes}
                      previous={metricsQuery.data.growth.prevWeekAvgLikes}
                      metricName="curtidas"
                    />
                  </div>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Eye className="h-3 w-3" /> Visualizações
                  </p>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={seriesData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v) => (v as string).slice(0, 10)} stroke="currentColor" opacity={0.5} />
                        <YAxis tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v) => formatCompact(v as number)} stroke="currentColor" opacity={0.5} width={42} />
                        <Tooltip
                          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number) => [formatCompact(value), "Visualizações"]}
                          labelFormatter={(label) => granularity === "daily" ? `Média do dia ${label}` : `Atualizado em ${label}`}
                        />
                        <Line type="monotone" dataKey="views" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                    <ThumbsUp className="h-3 w-3" /> Curtidas
                  </p>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={seriesData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v) => (v as string).slice(0, 10)} stroke="currentColor" opacity={0.5} />
                        <YAxis tick={{ fontSize: 10, fill: "currentColor" }} tickFormatter={(v) => formatCompact(v as number)} stroke="currentColor" opacity={0.5} width={42} />
                        <Tooltip
                          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                          formatter={(value: number) => [formatCompact(value), "Curtidas"]}
                          labelFormatter={(label) => granularity === "daily" ? `Média do dia ${label}` : `Atualizado em ${label}`}
                        />
                        <Line type="monotone" dataKey="likes" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GrowthCard({
  label,
  icon,
  percent,
  current,
  previous,
  metricName,
}: {
  label: string;
  icon: React.ReactNode;
  percent: number | null;
  current: number;
  previous: number;
  metricName: string;
}) {
  const detail =
    percent !== null
      ? `${formatCompact(previous)} → ${formatCompact(current)} ${metricName}/dia: diferença de ${formatCompact(Math.abs(current - previous))} ${metricName}/dia (${percent >= 0 ? "crescimento" : "queda"} de ${formatCompact(current)} ÷ ${formatCompact(previous)} − 1) × 100 = ${percent}%`
      : "Ainda não há média registrada na semana anterior para calcular o percentual.";
  return (
    <div
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-accent/30 px-3 py-2.5 transition-colors hover:border-primary/40"
      title={detail}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label} · média última semana: {formatCompact(current)}</p>
        {percent === null ? (
          <p className="text-xs text-muted-foreground">sem dados da semana anterior</p>
        ) : percent === 100 && previous === 0 ? (
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
            <ArrowUpRight className="h-3.5 w-3.5" /> nova atividade — +{percent}% vs. semana anterior
          </p>
        ) : percent > 0 ? (
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
            <ArrowUpRight className="h-3.5 w-3.5" /> +{percent}% vs. semana anterior
          </p>
        ) : percent === 0 ? (
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> estável (0%) vs. semana anterior
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
            <TrendingUp className="h-3.5 w-3.5 rotate-180" /> {percent}% vs. semana anterior
          </p>
        )}
        <div className="invisible absolute z-10 mt-1 min-w-[240px] rounded-lg border border-border/70 bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-xl opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
          <p className="mb-1 font-semibold">Números do cálculo</p>
          <p>Média diária última semana: <strong>{formatCompact(current)}</strong> {metricName}</p>
          <p>Média diária semana anterior: <strong>{formatCompact(previous)}</strong> {metricName}</p>
          {percent !== null && (
            <p>
              Variação: <strong>{percent >= 0 ? "+" : ""}{percent}%</strong> = ({formatCompact(current)} ÷ {formatCompact(previous)} − 1) × 100
            </p>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground/70">
          média da semana anterior: {formatCompact(previous)} {metricName}
        </p>
      </div>
    </div>
  );
}
