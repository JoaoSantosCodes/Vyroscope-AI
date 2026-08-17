import SiteLayout from "@/components/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCompact, formatDate, formatDuration, scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import type { AnalysisResult } from "@vyroscope-ai-server/analysis";
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Flame,
  MessageCircle,
  Radar,
  Loader2,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import { Calendar as CalendarIcon } from "lucide-react";
import { exportAgendaPdf, exportAnalysisCsv, exportAnalysisPdf } from "@/lib/export";
import { useMemo, useState } from "react";
import { useLimitConfirmation } from "@/hooks/useLimitConfirmation";
import ScriptDialog from "@/components/ScriptDialog";
import AlternativeTitlesDialog from "@/components/AlternativeTitlesDialog";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";
import { Heart } from "lucide-react";

export default function Result() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const detailQuery = trpc.analysis.get.useQuery(
    { id: params.id },
    { refetchInterval: 4000, enabled: true, retry: 1 }
  );

  const removeMutation = trpc.analysis.remove.useMutation({
    onSuccess: () => {
      toast.success("Análise removida do histórico.");
      utils.analysis.list.invalidate();
      navigate("/historico");
    },
    onError: (err) => toast.error(err.message),
  });

  if (detailQuery.isLoading) {
    return (
      <SiteLayout>
        <div className="container max-w-5xl py-10 space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-6 w-56" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      </SiteLayout>
    );
  }

  if (detailQuery.error) {
    return (
      <SiteLayout>
        <div className="container max-w-5xl py-16 flex flex-col items-center gap-4 text-center">
          <Radar className="h-10 w-10 text-muted-foreground/50" />
          <h2 className="font-display text-2xl font-semibold">Não foi possível carregar a análise</h2>
          <p className="text-sm text-muted-foreground">{detailQuery.error.message}</p>
          <Button variant="outline" onClick={() => navigate("/historico")}>
            Voltar ao histórico
          </Button>
        </div>
      </SiteLayout>
    );
  }

  const data = detailQuery.data;
  if (!data) {
    return (
      <SiteLayout>
        <div className="container max-w-5xl py-16 flex flex-col items-center gap-4 text-center">
          <h2 className="font-display text-2xl font-semibold">Análise não encontrada</h2>
          <Button variant="outline" onClick={() => navigate("/")}>
            Iniciar nova análise
          </Button>
        </div>
      </SiteLayout>
    );
  }

  const isRunning = data.status === "running";
  const isFailed = data.status === "failed";
  // Rodada 33: normaliza o tipo do retryLog (inferido como nunca quando superjson
  // não consegue tipar arrays do router interno) para uso na tela.
  const retryLog: Array<{
    attempt: number;
    at: number;
    type: "retrying" | "giving_up" | "succeeded";
    message: string;
    reason?: string;
    waitSeconds?: number;
  }> = Array.isArray(data.retryLog) ? data.retryLog : [];

  return (
    <SiteLayout>
      <div className="container max-w-5xl py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary">Resultado da análise</p>
            <h1 className="mt-1 font-display text-3xl font-semibold capitalize">{data.niche}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(data.createdAt)} · {data.videos.length} vídeos analisados
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(isRunning || isFailed) && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/analise?niche=${encodeURIComponent(data.niche)}`)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Analisar de novo
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate({ id: data.id })}>
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {isRunning && (
          <div className="space-y-4">
            <StillRunning />
            {retryLog.length > 0 && (
              <div className="mx-auto max-w-lg">
                <RetryLogPanel events={retryLog} />
              </div>
            )}
          </div>
        )}
        {isFailed && (
          <FailedState
            analysisId={data.id}
            message={data.errorMessage ?? "Erro desconhecido"}
            niche={data.niche}
            retryLog={retryLog}
          />
        )}
        {!isRunning && !isFailed && data.result && (
          <Dashboard result={data.result} videos={data.videos} analysisId={data.id} thumbnails={data.thumbnails ?? []} />
        )}
      </div>
    </SiteLayout>
  );
}

function useMemoSortedSuggestions(suggestions: AnalysisResult["suggestions"], sortBy: "score" | "duration") {
  return useMemo(() => {
    const sorted = [...suggestions];
    if (sortBy === "score") {
      sorted.sort((a, b) => b.viralityScore - a.viralityScore);
    } else {
      const mins = (targetLength: string) => {
        const m = targetLength.match(/(\d+)/g);
        return m ? Math.min(...m.map(Number)) : 0;
      };
      sorted.sort((a, b) => mins(b.targetLength) - mins(a.targetLength));
    }
    return sorted;
  }, [suggestions, sortBy]);
}

function SortMenu({
  value,
  onChange,
}: {
  value: "score" | "duration";
  onChange: (v: "score" | "duration") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <TrendingUp className="mr-1.5 h-4 w-4" />
          {value === "score" ? "Ordenar por score" : "Ordenar por duração"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onChange("score")}>
          <TrendingUp className="mr-2 h-4 w-4" /> Virality score (maior primeiro)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange("duration")}>
          <Clock className="mr-2 h-4 w-4" /> Duração (maior primeiro)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExportMenu({ result, niche }: { result: AnalysisResult; niche: string }) {
  const handleExport = async (format: "pdf" | "csv") => {
    try {
      if (format === "csv") {
        exportAnalysisCsv(result, niche);
        toast.success("Arquivo CSV baixado.");
      } else {
        await exportAnalysisPdf(result, niche);
        toast.success("Arquivo PDF baixado.");
      }
    } catch {
      toast.error("Não foi possível gerar o arquivo. Tente novamente.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-1.5 h-4 w-4" /> Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("pdf")}>
          <Download className="mr-2 h-4 w-4" /> Baixar PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          <Download className="mr-2 h-4 w-4" /> Baixar CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StillRunning() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <Radar className="h-9 w-9 text-primary vy-step-pulse" />
      <h2 className="font-display text-2xl font-semibold">Análise ainda em execução…</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        A página atualiza sozinha assim que os resultados ficarem prontos. Você pode continuar
        navegando e voltar ao histórico.
      </p>
    </div>
  );
}

function FailedState({
  analysisId,
  message,
  niche,
  retryLog,
}: {
  analysisId: string;
  message: string;
  niche: string;
  retryLog?: Array<{
    attempt: number;
    at: number;
    type: "retrying" | "giving_up" | "succeeded";
    message: string;
    reason?: string;
    waitSeconds?: number;
  }> | null;
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  // (Rodada 37) Modo "apenas avisar": erro PRECONDITION_FAILED abre o dialog de
  // confirmação; ao confirmar, o bloqueio é liberado até a meia-noite.
  const { handleLimitError, dialog: limitDialog } = useLimitConfirmation({
    onConfirm: () => retryMutation.mutate({ analysisId }),
    message: null,
  });
  const retryMutation = trpc.analysis.retry.useMutation({
    onSuccess: (res) => {
      toast.success("Nova análise iniciada — você será levado a ela.");
      void utils.analysis.list.invalidate();
      navigate(`/resultado/${res.id}`);
    },
    onError: (err) => {
      if (handleLimitError(err)) return;
      toast.error(err.message);
    },
  });
  const hasRetries = retryLog && retryLog.length > 0;
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <Radar className="h-10 w-10 text-destructive/70" />
      <h2 className="font-display text-2xl font-semibold">A análise não pôde ser concluída</h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {hasRetries && (
        <RetryLogPanel events={retryLog} />
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          onClick={() => retryMutation.mutate({ analysisId })}
          disabled={retryMutation.isPending}
        >
          {retryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <RotateCcw className="mr-2 h-4 w-4" />
          {retryMutation.isPending ? "Iniciando…" : "Tentar novamente (mesma análise)"}
        </Button>
        <Button variant="outline" onClick={() => navigate("/perfil")}>
          <Settings2 className="mr-2 h-4 w-4" />
          Configurar provedor
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate(`/analise?niche=${encodeURIComponent(niche)}`)}
          disabled={retryMutation.isPending}
        >
          Nova análise
        </Button>
      </div>
      {limitDialog}
    </div>
  );
}

/**
 * (Rodada 33) Painel com o log de retentativas do YouTube: mostra cada
 * tentativa, o motivo da falha e o tempo de espera antes de tentar de novo.
 */
function RetryLogPanel({
  events,
}: {
  events: Array<{
    attempt: number;
    at: number;
    type: "retrying" | "giving_up" | "succeeded";
    message: string;
    reason?: string;
    waitSeconds?: number;
  }>;
}) {
  return (
    <div className="w-full max-w-lg rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-left">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
        Tentativas realizadas na coleta do YouTube
      </p>
      <ul className="space-y-1.5">
        {events.map((event, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span
              className={
                event.type === "giving_up"
                  ? "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-destructive"
                  : "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400"
              }
            />
            <span>
              {new Date(event.at).toLocaleTimeString()} — {event.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type VideoWithScore = {
  analysisId: string;
  youtubeId: string;
  title: string;
  channelTitle: string | null;
  description: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  thumbnailUrl: string | null;
  score: number | null;
};

function Dashboard({
  result,
  videos,
  analysisId,
  thumbnails,
}: {
  result: AnalysisResult;
  videos: VideoWithScore[];
  analysisId: string;
  thumbnails: { id: number; suggestionTitle: string; imageUrl: string; prompt: string; favorite: number; createdAt: number }[];
}) {
  const patterns = [...(result.patterns ?? [])].sort((a, b) => b.score - a.score);
  const [sortBy, setSortBy] = useState<"score" | "duration">("score");
  const suggestions = useMemoSortedSuggestions(result.suggestions ?? [], sortBy);
  const generateAgendaMutation = trpc.extended.generateAgenda.useMutation({
    onError: (err) => toast.error(err.message),
  });
  const agenda = generateAgendaMutation.data;
  const videoMap = new Map(videos.map((v) => [v.youtubeId, v]));
  const scoredVideos = (result.videoScores ?? [])
    .map((s) => ({ ...s, video: videoMap.get(s.videoId) }))
    .filter((s): s is typeof s & { video: NonNullable<typeof s.video> } => !!s.video)
    .sort((a, b) => b.viralityScore - a.viralityScore);

  return (
    <Tabs defaultValue="suggestions" className="space-y-8">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="suggestions">Sugestões para gravar</TabsTrigger>
        <TabsTrigger value="patterns">Padrões de viralidade</TabsTrigger>
        <TabsTrigger value="videos">Vídeos analisados</TabsTrigger>
        <TabsTrigger value="agenda">Agenda do mês</TabsTrigger>
      </TabsList>

      <TabsContent value="suggestions" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Cinco sugestões prontas para gravar, combinando os padrões dominantes do nicho com
            ângulos ainda não explorados.
          </p>
          <div className="flex items-center gap-2">
            <SortMenu value={sortBy} onChange={setSortBy} />
            <ExportMenu result={result} niche={result.niche} />
          </div>
        </div>
        {suggestions.map((s, i) => (
          <SuggestionCard key={i} suggestion={s} index={i} analysisId={analysisId} thumbnails={thumbnails} />
        ))}
      </TabsContent>

      <TabsContent value="patterns">
        <div className="grid gap-4 md:grid-cols-2">
          {patterns.map((p) => (
            <Card key={p.pattern} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{p.pattern}</h3>
                  <div className="flex flex-col items-end">
                    <span className={`text-lg font-bold ${scoreColor(p.score)}`}>{p.score}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">score</span>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.explanation}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Presente em <strong className="text-foreground">{p.evidenceVideoCount}</strong> dos
                  vídeos analisados
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="agenda">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Plano de publicação de 4 semanas (1 vídeo por semana), sequenciado para ganhar tração
            inicial e sustentar o crescimento do canal.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateAgendaMutation.mutate({ analysisId })}
            disabled={generateAgendaMutation.isPending}
          >
            {generateAgendaMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Gerando agenda…
              </>
            ) : (
              <>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" /> Gerar agenda do mês
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!agenda) {
                toast.error("Gere a agenda primeiro para exportá-la.");
                return;
              }
              exportAgendaPdf(agenda)
                .then(() => toast.success("Agenda baixada em PDF."))
                .catch(() => toast.error("Não foi possível gerar o PDF da agenda."));
            }}
            disabled={!agenda}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar PDF
          </Button>
        </div>
        {agenda ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/30 bg-accent/20 p-4 text-sm leading-relaxed">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Estratégia do mês</p>
              {agenda.strategy}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[...agenda.items].sort((a, b) => a.week - b.week).map((item) => (
                <Card key={item.week} className="border-border/60">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Semana {item.week}</p>
                      <ScorePill score={item.viralityScore} />
                    </div>
                    <h3 className="mt-2 text-base font-semibold leading-snug">{item.title}</h3>
                    <p className="mt-1.5 text-sm italic text-muted-foreground">“{item.hook}”</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {item.targetLength}</span>
                      <span>{item.goal}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[24vh] flex-col items-center justify-center gap-3 text-center">
            <CalendarIcon className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma agenda gerada ainda para esta análise.</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="videos">
        <div className="space-y-3">
          {scoredVideos.map((sv) => {
            const v = sv.video;
            const engagement =
              v.viewCount && v.viewCount > 0
                ? Math.round((((v.likeCount ?? 0) + (v.commentCount ?? 0)) / v.viewCount) * 10000) / 100
                : null;
            return (
              <Card key={v.youtubeId} className="border-border/60 transition-colors hover:border-primary/30">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    {v.thumbnailUrl && (
                      <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        className="h-20 w-36 shrink-0 rounded-md object-cover sm:h-24 sm:w-44"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 font-semibold leading-snug">{v.title}</h3>
                        <ScorePill score={sv.viralityScore} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {v.channelTitle} · {v.publishedAt ? formatDate(Date.parse(v.publishedAt)) : "—"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> {formatCompact(v.viewCount)} views</span>
                        <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {formatCompact(v.likeCount)}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {formatCompact(v.commentCount)}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDuration(v.durationSeconds)}</span>
                        {engagement !== null && (
                          <span className="text-primary">engajamento {engagement.toFixed(2)}%</span>
                        )}
                      </div>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${v.youtubeId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary sm:flex"
                    >
                      Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function ScorePill({ score }: { score: number }) {
  return (
    <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreColor(score)} border-current/25 bg-accent/50`}>
      {score} · {scoreLabel(score)}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  index,
  analysisId,
  thumbnails,
}: {
  suggestion: NonNullable<AnalysisResult["suggestions"]>[number];
  index: number;
  analysisId: string;
  thumbnails: { id: number; suggestionTitle: string; imageUrl: string; prompt: string; favorite: number; createdAt: number }[];
}) {
  const [copied, setCopied] = useState(false);
  const [scriptDialog, setScriptDialog] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [altTitlesOpen, setAltTitlesOpen] = useState(false);
  const utils = trpc.useUtils();
  const generateScriptMutation = trpc.extended.generateScript.useMutation({
    onSuccess: () => setScriptDialog(true),
    onError: (err) => toast.error(err.message),
  });
  const generateThumbnailMutation = trpc.extended.generateThumbnail.useMutation({
    onSuccess: (data) => {
      setThumbnail(data.imageUrl);
      toast.success("Thumbnail gerada com sucesso.");
      // Recarrega a análise para que a nova thumbnail apareça vinculada ao coração de favoritos
      utils.analysis.get.invalidate({ id: analysisId }).then(() => {
        utils.analysis.get.fetch({ id: analysisId }).then((fresh) => {
          const matches = (fresh?.thumbnails ?? []).filter((t) => t.suggestionTitle === suggestion.title);
          const latest = matches.reduce((a, b) => (b.createdAt > (a?.createdAt ?? -1) ? b : a), undefined as typeof matches[number] | undefined);
          if (latest) setThumbnail(latest.imageUrl);
        });
      });
    },
    onError: (err) => toast.error(err.message),
  });
  const toggleFavoriteMutation = trpc.extended.toggleFavorite.useMutation({
    onMutate: async ({ thumbnailId, favorite }) => {
      await utils.analysis.get.cancel({ id: analysisId });
      const previous = utils.analysis.get.getData({ id: analysisId });
      utils.analysis.get.setData({ id: analysisId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          thumbnails: old.thumbnails.map((t) => (t.id === thumbnailId ? { ...t, favorite: favorite ? 1 : 0 } : t)),
        };
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) utils.analysis.get.setData({ id: analysisId }, context.previous);
      toast.error(err.message);
    },
    onSettled: () => {
      utils.extended.listFavorites.invalidate();
      utils.analysis.get.invalidate({ id: analysisId });
    },
  });
  const generateAltTitlesMutation = trpc.extended.generateAlternativeTitles.useMutation({
    onSuccess: () => setAltTitlesOpen(true),
    onError: (err) => toast.error(err.message),
  });
  // Se a imagem gerada já existe nas thumbnails da análise (recarregada), vincula o id para favoritar
  const linkedThumbnail = useMemo(
    () => (thumbnail ? thumbnails.find((t) => t.imageUrl === thumbnail) ?? null : null),
    [thumbnail, thumbnails]
  );
  const thumbnailFav = linkedThumbnail !== null && linkedThumbnail.favorite === 1;
  const handleFavorite = async () => {
    if (linkedThumbnail === null) {
      toast.error("Gere a thumbnail primeiro para salvá-la nos favoritos.");
      return;
    }
    toggleFavoriteMutation.mutate({ thumbnailId: linkedThumbnail.id, favorite: !thumbnailFav });
    toast.success(thumbnailFav ? "Removida dos favoritos." : "Adicionada aos favoritos.");
  };
  const openThumbnail = () => {
    if (!thumbnail) return;
    const a = document.createElement("a");
    a.href = thumbnail;
    a.download = `vyroscope-thumbnail-${slugifyText(suggestion.title)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const slugifyText = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

  const copyAll = async () => {
    const text = [
      `TEMA: ${suggestion.title}`,
      `HOOK: ${suggestion.hook}`,
      `ÂNGULO: ${suggestion.angle}`,
      `ESTRUTURA: ${suggestion.narrativeStructure}`,
      `DURAÇÃO ALVO: ${suggestion.targetLength}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Sugestão copiada para a área de transferência");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Card className="border-border/60 bg-card/70 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-3xl font-medium text-primary/50">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="text-lg font-semibold leading-snug">{suggestion.title}</h3>
              <div className="mt-1.5 flex items-center gap-2">
                <ScorePill score={suggestion.viralityScore} />
                <span className="text-xs text-muted-foreground">duração alvo: {suggestion.targetLength}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateScriptMutation.mutate({ analysisId, suggestionIndex: index })}
              disabled={generateScriptMutation.isPending}
            >
              {generateScriptMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Gerando…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Gerar roteiro
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={copyAll}>
              {copied ? (
                <>Copiado</>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar tudo
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateThumbnailMutation.mutate({ analysisId, suggestionIndex: index })}
              disabled={generateThumbnailMutation.isPending}
            >
              {generateThumbnailMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Gerando…
                </>
              ) : (
                <>
                  <Radar className="mr-1.5 h-3.5 w-3.5" /> Gerar thumbnail
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateAltTitlesMutation.mutate({ analysisId, suggestionIndex: index })}
              disabled={generateAltTitlesMutation.isPending}
            >
              {generateAltTitlesMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Gerando…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Títulos alternativos
                </>
              )}
            </Button>
          </div>
          {thumbnail && (
            <div className="mt-4 w-full overflow-hidden rounded-lg border border-border/60">
              <div className="relative">
                <button
                  type="button"
                  onClick={handleFavorite}
                  disabled={toggleFavoriteMutation.isPending}
                  aria-label={thumbnailFav ? "Remover dos favoritos" : "Salvar nos favoritos"}
                  className={`absolute right-3 top-3 rounded-full p-2 backdrop-blur-md transition-all active:scale-90 ${
                    thumbnailFav
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/40"
                      : "bg-black/50 text-white hover:bg-primary hover:text-primary-foreground"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${thumbnailFav ? "fill-current" : ""}`} />
                </button>
              </div>
              <div className="flex items-start justify-between gap-2 bg-background/60 px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Thumbnail sugerida</p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={openThumbnail}
                >
                  Baixar PNG
                </button>
              </div>
              <img src={thumbnail} alt={`Thumbnail sugerida para ${suggestion.title}`} className="aspect-video w-full object-cover" loading="lazy" />
            </div>
          )}
        {scriptDialog && generateScriptMutation.data && (
          <ScriptDialog
            suggestion={suggestion}
            script={generateScriptMutation.data}
            open={scriptDialog}
            onOpenChange={setScriptDialog}
          />
        )}
        {altTitlesOpen && generateAltTitlesMutation.data && (
          <AlternativeTitlesDialog
            titles={generateAltTitlesMutation.data.titles}
            originalTitle={generateAltTitlesMutation.data.suggestionTitle}
            open={altTitlesOpen}
            onOpenChange={setAltTitlesOpen}
          />
        )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Flame className="h-3.5 w-3.5" /> Hook — primeiros 5 segundos
            </p>
            <p className="text-sm italic leading-relaxed">“{suggestion.hook}”</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Ângulo
            </p>
            <p className="text-sm leading-relaxed">{suggestion.angle}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <ArrowRight className="h-3.5 w-3.5" /> Estrutura narrativa
          </p>
          <ol className="grid gap-2 text-sm leading-relaxed md:grid-cols-3">
            {suggestion.narrativeStructure.split(/\n|(?<=\.) (?=[A-ZÀ-Ú0-9])/).filter(Boolean).slice(0, 3).map((part, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-accent text-center text-xs leading-5 text-accent-foreground">{i + 1}</span>
                <span className="text-muted-foreground">{part.trim()}</span>
              </li>
            ))}
          </ol>
          {suggestion.reasoning && (
            <p className="mt-3 border-t border-border/40 pt-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Por que tem potencial:</strong> {suggestion.reasoning}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
