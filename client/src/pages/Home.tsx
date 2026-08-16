import SiteLayout from "@/components/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  Clock,
  Lightbulb,
  Loader2,
  Radar,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { useLocation } from "wouter";

const EXAMPLE_NICHES = ["inteligência artificial", "fitness", "finanças", "games", "produtividade", "moda"];

export default function Home() {
  const [niche, setNiche] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const ideaQuery = trpc.extended.ideaOfTheDay.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 0,
  });

  const handleAnalyze = () => {
    const trimmed = niche.trim();
    if (trimmed.length < 2) {
      toast.error("Digite um nicho válido (mínimo 2 caracteres).");
      return;
    }
    if (trimmed.length > 120) {
      toast.error("O nicho é muito longo (máximo 120 caracteres).");
      return;
    }
    navigate(`/analise?niche=${encodeURIComponent(trimmed)}`);
  };

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="texture-bg relative overflow-hidden">
        <div className="container relative z-10 flex flex-col items-start gap-10 pb-16 pt-16 md:pt-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Padrões reais, extraídos dos vídeos que estão explodindo agora
            </p>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight md:text-6xl">
              O algoritmo esqueceu seu canal?
              <br />
              <span className="text-primary">Descubra o que faz um vídeo explodir.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              O Vyroscope AI analisa os vídeos em alta do seu nicho, identifica os
              padrões de viralidade por trás das métricas e entrega <strong className="text-foreground">sugestões
              prontas de temas, hooks e ângulos</strong> — para você gravar amanhã de manhã.
            </p>
          </div>

          {/* Input */}
            <Card className="w-full max-w-xl border-border/70 bg-card/80 shadow-2xl shadow-black/30 backdrop-blur">
            <CardContent className="p-3 sm:p-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                <Input
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="Ex: inteligência artificial, fitness, finanças…"
                  className="h-12 bg-background/60 text-base"
                  aria-label="Nicho do seu canal"
                />
                <Button
                  onClick={handleAnalyze}
                  className="h-12 shrink-0 px-7 text-base font-semibold"
                  size="lg"
                >
                  <Radar className="mr-2 h-5 w-5" />
                  Iniciar análise
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_NICHES.map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setNiche(n);
                    }}
                    className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {!isAuthenticated ? (
            <p className="max-w-xl text-sm text-muted-foreground">
              Análises ficam salvas no seu histórico pessoal.{" "}
              <button
                onClick={() => startLogin()}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Entre com sua conta
              </button>{" "}
              para começar.
            </p>
          ) : (
            <IdeaOfTheDayCard />
          )}
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-t border-border/50 py-20">
        <div className="container">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Como funciona</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            De nicho para roteiro em minutos
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Video,
                title: "Coleta vídeos em alta",
                text: "Buscamos os vídeos que estão performando acima da média no seu nicho e extraímos título, visualizações, likes, comentários, duração e data de publicação.",
              },
              {
                icon: TrendingUp,
                title: "Extraímos os padrões",
                text: "Uma IA analisa títulos, descrições e métricas de engajamento, pontua a probabilidade de viralização de cada vídeo e destila os padrões narrativos que estão vencendo agora.",
              },
              {
                icon: Lightbulb,
                title: "Sugestões prontas para gravar",
                text: "Você recebe temas, hooks de abertura e ângulos completos com estrutura narrativa e duração alvo — prontos para uso, sem edição adicional.",
              },
            ].map((step, i) => (
              <Card key={step.title} className="group border-border/60 bg-card/60 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="font-display text-4xl font-medium text-muted-foreground/30 transition-colors group-hover:text-primary/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* O que você recebe */}
      <section className="border-t border-border/50 bg-secondary/30 py-20">
        <div className="container">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary">Entregáveis</p>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Tudo o que o algoritmo recompensa, em um dashboard
              </h2>
              <p className="mt-4 text-muted-foreground">
                Cada análise devolve os vídeos analisados com seus <strong className="text-foreground">virality
                scores</strong>, os padrões de viralidade do nicho e cinco sugestões
                completas — com título, hook literal dos primeiros 5 segundos, ângulo,
                estrutura narrativa em três atos e duração ideal.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Virality score (0–100) para cada vídeo e sugestão",
                  "Padrões de título, hook e estrutura narrativa pontuados",
                  "Sugestões prontas para gravar, sem edição adicional",
                  "Histórico de análises salvo na sua conta",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Card className="border-border/60 bg-card/70 shadow-2xl shadow-black/30 backdrop-blur">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> Análise em 4 etapas visíveis
                </div>
                {["Buscando vídeos em alta no nicho…", "Extraindo métricas de engajamento…", "Identificando padrões de viralidade…", "Gerando sugestões prontas para gravar…"].map(
                  (step, i) => (
                    <div key={step} className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-4 py-3 text-sm">
                      <Radar
                        className={`h-4 w-4 text-primary ${i === 2 ? "vy-step-pulse" : "opacity-40"}`}
                      />
                      <span className="text-foreground/80">{step}</span>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}

function buildPlainText(outline: NonNullable<Parameters<typeof OutlineDialog>[0]["outline"]>): string {
  return [
    `# ${outline.outline.title}`,
    ``,
    `Duração alvo: ${outline.outline.totalLength}`,
    ``,
    ...outline.outline.acts.map(
      (a) =>
        `## ${a.label} (${a.duration})\n\n` +
        a.points.map((p) => `- ${p}`).join("\n") +
        `\n\nFala-chave: "${a.keyLine}"`
    ),
    ``,
    `Notas de produção:\n${outline.outline.notes.map((n) => `- ${n}`).join("\n")}`,
  ].join("\n");
}

function OutlineDialog({ outline, onOpenChange }: { outline: { niche: string; analysisId: string; suggestion: { title: string; viralityScore: number | null } | null; outline: { title: string; totalLength: string; acts: { act: string; label: string; duration: string; points: string[]; keyLine: string }[]; notes: string[] } } | null; onOpenChange: (open: boolean) => void }) {
  const [editableText, setEditableText] = useState<string | null>(null);

  useEffect(() => {
    setEditableText(outline ? buildPlainText(outline) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outline?.analysisId]);

  const handleCopy = async () => {
    const text = editableText ?? (outline ? buildPlainText(outline) : "");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Esboço copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const handleExportTxt = () => {
    const text = editableText ?? (outline ? buildPlainText(outline) : "");
    if (!text || !outline) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esboco-${outline.outline.title.slice(0, 40).trim()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Esboço exportado em TXT.");
  };

  const handleReset = () => {
    if (outline) setEditableText(buildPlainText(outline));
  };

  return (
    <Dialog open={!!outline} onOpenChange={(open) => { if (!open) onOpenChange(false); }}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Esboço de roteiro</DialogTitle>
          <DialogDescription>{outline?.outline.title} · {outline?.outline.totalLength}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {outline?.outline.acts.map((a) => (
            <div key={a.act} className="rounded-lg border border-border/50 bg-background/60 p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">{a.label}</span>
                <span className="text-[11px] text-muted-foreground">{a.duration}</span>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {a.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/85">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 border-l-2 border-primary/50 pl-2.5 text-sm italic leading-relaxed text-muted-foreground">
                "{a.keyLine}"
              </p>
            </div>
          ))}
          {outline?.outline.notes && outline.outline.notes.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-background/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notas de produção</p>
              <ul className="mt-2 space-y-1.5">
                {outline.outline.notes.map((n, i) => (
                  <li key={i} className="text-sm text-foreground/85">• {n}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Texto do esboço (editável)
              </p>
              {editableText !== null && outline ? (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] text-muted-foreground transition-colors hover:text-primary"
                >
                  Restaurar original
                </button>
              ) : null}
            </div>
            <textarea
              value={editableText ?? ""}
              onChange={(e) => setEditableText(e.target.value)}
              className="h-64 w-full rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-[13px] leading-relaxed text-foreground/85 outline-none transition-colors focus:border-primary/60"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleCopy}>Copiar esboço</Button>
            <Button size="sm" variant="outline" onClick={handleExportTxt}>Exportar TXT</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IdeaOfTheDayCard() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const ideaQuery = trpc.extended.ideaOfTheDay.useQuery(undefined, { refetchInterval: 0 });

  // ===== Alerta de ideias estagnadas em "Gravando" (>7 dias) =====
  const STAGNATION_DAYS = 7;
  // O card só é renderizado para usuários autenticados (Home já condicionaliza)
  const staleQuery = trpc.extended.listPinnedIdeas.useQuery(undefined, {
    refetchInterval: 15 * 60 * 1000,
  });
  const staleIdeas = (staleQuery.data?.ideas ?? [])
    .filter((p) => p.archived === 0 && p.status === "gravando" && p.statusChangedAt)
    .filter((p) => Date.now() - new Date(p.statusChangedAt).getTime() > STAGNATION_DAYS * 24 * 60 * 60 * 1000);

  // ===== Alerta de progresso da meta mensal (rodada 20) =====
  // Mostra quando o mês está avançando e a meta ainda não foi alcançada:
  // "Dia X do mês: N/M publicadas (Y% concluído)".
  const statsQuery = trpc.extended.pinnedProductionStats.useQuery(undefined, {
    refetchInterval: 15 * 60 * 1000,
  });
  const monthProgressDay = new Date().getDate();
  const monthProgressStats = statsQuery.data;
  const showGoalAlert =
    statsQuery.isSuccess &&
    monthProgressStats &&
    monthProgressStats.publishedThisMonth < monthProgressStats.goal &&
    (monthProgressDay >= 10 || monthProgressStats.publishedThisMonth > 0);
  const monthProgressPct = monthProgressStats && monthProgressStats.goal > 0
    ? Math.min(100, Math.round((monthProgressStats.publishedThisMonth / monthProgressStats.goal) * 100))
    : 0;

  // ===== Alerta de fim de mês (rodada 24) =====
  // Mostra quando o mês está avançando (dia >= 20), a meta ainda não foi
  // atingida e ainda há dias suficientes para atingi-la:
  // "Restam N publicações para atingir a meta até o fim do mês".
  const endOfMonthQuery = trpc.extended.endOfMonthGoalAlert.useQuery(undefined, {
    refetchInterval: 15 * 60 * 1000,
    enabled: !showGoalAlert,
  });
  const endAlert = endOfMonthQuery.data;
  const showEndOfMonthAlert =
    endOfMonthQuery.isSuccess &&
    !!endAlert &&
    endAlert.isEndOfMonth &&
    !endAlert.met &&
    endAlert.reachable &&
    endAlert.needsN > 0;

  // ===== Feedback de início de mês (rodada 25) =====
  // Mostra nos primeiros 5 dias quando a meta do mês anterior não foi atingida,
  // sugerindo ajustes com base na média recente de publicações.
  const missedGoalQuery = trpc.extended.missedGoalFeedback.useQuery(undefined, {
    refetchInterval: 15 * 60 * 1000,
    enabled: !showGoalAlert && !showEndOfMonthAlert,
  });
  const missedAlert = missedGoalQuery.data;
  const showMissedGoalFeedback =
    missedGoalQuery.isSuccess &&
    !!missedAlert &&
    missedAlert.isMonthStart &&
    missedAlert.missed;

  // Aplica a meta sugerida (média dos últimos 6 meses) na meta do mês corrente (rodada 26)
  const applySuggestedGoalMutation = trpc.extended.applySuggestedGoal.useMutation({
    onSuccess: (data) => {
      utils.extended.pinnedProductionStats.invalidate();
      utils.extended.missedGoalFeedback.invalidate();
      toast.success(`Meta de ${data.goal} aplicada para ${data.monthKey} — com base na sua média dos últimos 6 meses.`);
    },
    onError: (err) => toast.error(err.message || "Falha ao aplicar a meta sugerida."),
  });
  const handleApplySuggestedGoal = (e: React.MouseEvent) => {
    e.stopPropagation();
    applySuggestedGoalMutation.mutate();
  };

  const archivePublishedMutation = trpc.extended.archivePublishedIdeas.useMutation({
    onSuccess: (data) => {
      utils.extended.listPinnedIdeas.invalidate();
      toast.success(`Arquivadas automaticamente: ${data.archived} ideia${data.archived === 1 ? "" : "s"} publicada${data.archived === 1 ? "" : "s"}.`);
    },
    onError: (err) => toast.error(err.message || "Falha ao arquivar as publicadas."),
  });
  const handleArchivePublished = (e: React.MouseEvent) => {
    e.stopPropagation();
    archivePublishedMutation.mutate();
  };

  const [outline, setOutline] = useState<{ niche: string; analysisId: string; suggestion: { title: string; viralityScore: number | null; hook?: string; angle?: string; targetLength?: string }; outline: { title: string; totalLength: string; acts: { act: string; label: string; duration: string; points: string[]; keyLine: string }[]; notes: string[] } } | null>(null);
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false);
  const outlineMutation = trpc.extended.generateIdeaOutline.useMutation({
    onSuccess: (data) => {
      setOutline(data);
      setOutlineDialogOpen(true);
      toast.success("Esboço de roteiro gerado.");
    },
    onError: (err) => toast.error(err.message || "Falha ao gerar o esboço."),
  });

  const handleRefresh = () => {
    utils.extended.ideaOfTheDay.invalidate();
    toast.success("Sugestão atualizada.");
  };

  return (
    <>
      {showGoalAlert && (
        <button
          type="button"
          onClick={() => navigate("/ideia-do-dia")}
          className="mb-4 flex w-full max-w-2xl items-center gap-2.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-left transition-colors hover:border-amber-500/70 hover:bg-amber-500/15"
        >
          <span className="animate-pulse text-amber-500">●</span>
          <span className="flex-1 text-xs sm:text-sm">
            <strong className="text-amber-600">Dia {monthProgressDay} do mês</strong>: <strong className="text-amber-600">{monthProgressStats.publishedThisMonth}/{monthProgressStats.goal} publicada{monthProgressStats.publishedThisMonth === 1 ? "" : "s"}</strong> ({monthProgressPct}% concluído) — a meta de publicações ainda não foi alcançada. Abra o quadro Kanban para avançar.
          </span>
        </button>
      )}
      {showEndOfMonthAlert && endAlert && (
        <button
          type="button"
          onClick={() => navigate("/ideia-do-dia")}
          className="mb-4 flex w-full max-w-2xl items-center gap-2.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5 text-left transition-colors hover:border-emerald-500/70 hover:bg-emerald-500/15"
        >
          <span className="animate-pulse text-emerald-500">●</span>
          <span className="flex-1 text-xs sm:text-sm">
            <strong className="text-emerald-500">Fim do mês</strong>: faltam <strong className="text-emerald-500">{endAlert.needsN} publicação{endAlert.needsN === 1 ? "" : "s"}</strong> para atingir a meta de {endAlert.goal} até o dia {endAlert.remainingDays === 0 ? "último" : `${endAlert.remainingDays} do mês`} — ainda dá tempo, continue no ritmo!
          </span>
        </button>
      )}
      {/* Feedback de meta não atingida no mês anterior (rodada 25) + aplicar meta sugerida (rodada 26) */}
      {showMissedGoalFeedback && missedAlert && (
        <div className="mb-4 flex w-full max-w-2xl items-center gap-2.5 rounded-lg border border-sky-500/50 bg-sky-500/10 px-4 py-2.5">
          <span className="animate-pulse text-sky-500">●</span>
          <span className="flex-1 text-xs sm:text-sm">
            <strong className="text-sky-500">Meta de {missedAlert.previousMonthKey} não atingida</strong>: {missedAlert.published} de {missedAlert.goal} publicações — {missedAlert.suggestion}
          </span>
          {missedAlert.suggestedGoal !== null && (
            <button
              type="button"
              disabled={applySuggestedGoalMutation.isPending}
              onClick={handleApplySuggestedGoal}
              className="shrink-0 rounded-md bg-sky-500/20 px-2.5 py-1 text-[11px] font-medium text-sky-300 transition-colors hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              title={`Aplicar a meta sugerida de ${missedAlert.suggestedGoal} publicações no mês corrente (média dos últimos 6 meses)`}
            >
              {applySuggestedGoalMutation.isPending ? "Aplicando…" : `Aplicar meta ${missedAlert.suggestedGoal}`}
            </button>
          )}
        </div>
      )}
      {staleQuery.isSuccess && staleIdeas.length > 0 && (
        <button
          type="button"
          onClick={() => navigate("/ideia-do-dia")}
          className="mb-4 flex w-full max-w-2xl items-center gap-2.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-left transition-colors hover:border-amber-500/70 hover:bg-amber-500/15"
        >
          <span className="animate-pulse text-amber-500">⏸</span>
          <span className="flex-1 text-xs sm:text-sm">
            <strong className="text-amber-600">{staleIdeas.length} ideia{staleIdeas.length === 1 ? "" : "s"} parada{staleIdeas.length === 1 ? "" : "s"}</strong> há mais de {STAGNATION_DAYS} dias em “Gravando” — abra o quadro Kanban para resolver.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 hover:text-amber-400"
            disabled={archivePublishedMutation.isPending}
            onClick={handleArchivePublished}
          >
            {archivePublishedMutation.isPending ? "Arquivando..." : "Arquivar publicadas"}
          </Button>
        </button>
      )}
      <Card className="w-full max-w-2xl border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card shadow-2xl shadow-black/30">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Lightbulb className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Ideia do dia</p>
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                {ideaQuery.data?.idea ? ` · ${ideaQuery.data.idea.niche}` : ""}
              </p>
            </div>
          </div>
          {ideaQuery.data?.idea && (
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <RefreshCcw className="h-3.5 w-3.5" /> Trocar ideia
            </button>
          )}
        </div>
        {ideaQuery.isLoading ? (
          <div className="mt-4 flex min-h-[120px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : ideaQuery.data?.reason === "no_completed_analyses" ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Ainda não há análises concluídas na sua conta. Execute sua primeira análise para
              receber ideias diárias baseadas nos padrões do seu nicho principal.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[aria-label="Nicho do seu canal"]');
              input?.focus();
            }}>
              Fazer minha primeira análise
            </Button>
          </div>
        ) : !ideaQuery.data?.idea ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Não foi possível gerar uma ideia para hoje. Tente novamente mais tarde.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <h3 className="font-display text-xl font-semibold leading-snug sm:text-2xl">
              {ideaQuery.data.idea.suggestion.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreColor(ideaQuery.data.idea.suggestion.viralityScore ?? 0)} border-current/25 bg-accent/50`}
              >
                {ideaQuery.data.idea.suggestion.viralityScore} · {scoreLabel(ideaQuery.data.idea.suggestion.viralityScore ?? 0)}
              </span>
              <Badge variant="outline" className="text-xs font-normal">
                {scoreLabel(ideaQuery.data.idea.suggestion.viralityScore ?? 0)} de chance de viralização
              </Badge>
            </div>
            <blockquote className="border-l-2 border-primary/50 pl-3 text-sm italic leading-relaxed text-muted-foreground">
              {ideaQuery.data.idea.suggestion.hook}
            </blockquote>
            {ideaQuery.data.idea.suggestion.angle && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Ângulo: </strong>
                {ideaQuery.data.idea.suggestion.angle}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="sm" onClick={() => navigate(`/resultado/${ideaQuery.data.idea!.analysisId}`)}>
                Abrir análise completa <Radar className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={outlineMutation.isPending}
                onClick={() => outlineMutation.mutate()}
              >
                {outlineMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
                Gerar esboço de roteiro
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    .writeText(`${ideaQuery.data.idea!.suggestion.title}${ideaQuery.data.idea!.suggestion.hook ? `\nHook: ${ideaQuery.data.idea!.suggestion.hook}` : ""}`)
                    .then(() => toast.success("Título e hook copiados."))
                    .catch(() => toast.error("Não foi possível copiar."));
                }}
              >
                Copiar título + hook
              </Button>
              <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> rotaciona todo dia, baseada no seu nicho principal
              </span>
            </div>
          </div>
        )}
        <OutlineDialog outline={outline} onOpenChange={(open) => !open && setOutline(null)} />
      </CardContent>
    </Card>
    </>
  );
}
