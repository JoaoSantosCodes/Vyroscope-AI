import { useLocation } from "wouter";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Badge as GoalBadge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import GoalCelebrationView from "@/components/GoalCelebration";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as ChartTooltip } from "recharts";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Flame,
  PartyPopper,
  Target,
  TrendingDown,
  Medal,
  TrendingUp,
  Trophy,
  XCircle,
  CalendarDays,
  FileDown,
} from "lucide-react";

export default function Streaks() {
  const [, navigate] = useLocation();
  const streakQuery = trpc.extended.pinnedGoalStreak.useQuery(undefined, {
    refetchInterval: 15 * 60 * 1000,
  });
  const historyQuery = trpc.extended.pinnedMonthlyHistory.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const history = historyQuery.data ?? [];
  const metCount = history.filter((m) => m.met && !m.isCurrent).length;
  const streak = streakQuery.data?.streak ?? 0;

  // ===== Exportação do histórico de streaks em PDF (rodada 22) =====
  const exportStreaksMutation = trpc.extended.exportStreaksPdf.useMutation({
    onSuccess: (data) => {
      window.open(data.downloadUrl, "_blank");
      toast.success("PDF do histórico de metas mensais gerado.");
    },
    onError: (err) => toast.error(err.message || "Falha ao gerar o PDF de metas mensais."),
  });

  // ===== Ano em números (rodada 23) =====
  const yearSummaryQuery = trpc.extended.yearSummary.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const exportYearMutation = trpc.extended.exportYearPdf.useMutation({
    onSuccess: (data) => {
      window.open(data.downloadUrl, "_blank");
      toast.success(`PDF do ano em números (${yearSummaryQuery.data?.year ?? ""}) gerado.`);
    },
    onError: (err) => toast.error(err.message || "Falha ao gerar o PDF do ano em números."),
  });
  const year = yearSummaryQuery.data?.year ?? new Date().getFullYear();
  const sy = yearSummaryQuery.data;

  // ===== PDF dedicado da galeria de conquistas (rodada 28) =====
  const exportAchievementsMutation = trpc.extended.exportAchievementsPdf.useMutation({
    onSuccess: (data) => {
      window.open(data.downloadUrl, "_blank");
      toast.success("PDF da galeria de conquistas gerado.");
    },
    onError: (err) => toast.error(err.message || "Falha ao gerar o PDF de conquistas."),
  });

  // ===== Comparativo de anos (rodada 24) =====
  const [compareYear, setCompareYear] = useState<number | null>(null);
  const compareQuery = trpc.extended.yearComparison.useQuery(
    { years: [compareYear ?? year - 1, year] as [number, number] },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000, enabled: compareYear !== null }
  );

  // ===== Meta anual (rodada 24) =====
  const annualGoalQuery = trpc.extended.annualGoal.useQuery(
    { year },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000, enabled: !!sy }
  );
  const ag = annualGoalQuery.data;

  // ===== Galeria de conquistas (rodada 25): selos de "Ano Completo" =====
  const achievementsQuery = trpc.extended.achievements.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // ===== Conquistas intermediárias (rodada 26): trimestres e semestres =====
  const intermediateQuery = trpc.extended.intermediateAchievements.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // ===== Toggle do gráfico comparativo (rodada 26): publicações vs % da meta =====
  const [compareMode, setCompareMode] = useState<"published" | "percent">("published");

  // ===== Comparativo mês a mês (rodada 25): barras lado a lado =====
  const compareByMonthQuery = trpc.extended.yearComparisonByMonth.useQuery(
    { years: [compareYear ?? year - 1, year] as [number, number] },
    { refetchOnWindowFocus: false, staleTime: 5 * 60 * 1000, enabled: compareYear !== null }
  );

  // ===== Persistência da celebração (rodada 23): rever confetes =====
  const celebrationsQuery = trpc.extended.listGoalCelebrations.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const markReachedMutation = trpc.extended.markGoalReached.useMutation({
    onError: (err) => toast.error(err.message || "Falha ao registrar a celebração."),
  });
  const [replayCount, setReplayCount] = useState<number>(0);

  return (
    <DashboardLayout>
      <div className="container max-w-3xl py-8">
        <button
          type="button"
          className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => navigate("/ideia-do-dia")}
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar ao quadro Kanban
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <Flame className="h-6 w-6 text-amber-500" />
              Histórico de metas mensais
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhamento mês a mês: meta configurada, publicações realizadas e se a meta foi cumprida.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={exportStreaksMutation.isPending}
            onClick={() => exportStreaksMutation.mutate({})}
          >
            {exportStreaksMutation.isPending ? (
              <FileDown className="mr-1.5 h-3.5 w-3.5 animate-spin opacity-70" />
            ) : (
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
            )}
            Exportar streaks em PDF
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sequência atual</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-amber-500">{streak}</span>
              <span className="text-xs text-muted-foreground">
                {streak === 1 ? "mês" : "meses"}
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Metas cumpridas (12 meses)</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold text-emerald-500">{metCount}</span>
              <span className="text-xs text-muted-foreground">/ 12</span>
            </div>
          </div>
          <div className="col-span-2 rounded-lg border border-border bg-card p-3 sm:col-span-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Publicações (12 meses)</div>
            <div className="mt-1 text-xl font-bold text-foreground">
              {history.reduce((sum, m) => sum + m.publishedThisMonth, 0)}
            </div>
          </div>
        </div>

        {/* Mini-gráfico dos últimos 12 meses */}
        <div className="mt-5 rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Publicadas por mês</h2>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> meta cumprida
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-primary/70" /> em andamento
            </span>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis
                  dataKey="monthKey"
                  tick={{ fontSize: 9, fill: "currentColor", opacity: 0.6 }}
                  tickFormatter={(v: string) => v.slice(2)}
                  stroke="currentColor"
                  opacity={0.4}
                  height={18}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "currentColor", opacity: 0.6 }}
                  stroke="currentColor"
                  opacity={0.4}
                  width={18}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as
                      | { monthKey?: string; label?: string; publishedThisMonth?: number; goal?: number; met?: boolean }
                      | undefined;
                    if (!active || !row) return null;
                    return (
                      <div className="rounded border border-border bg-card px-2.5 py-1.5 text-[11px] shadow-md">
                        <div className="font-medium capitalize text-foreground">{row.label ?? row.monthKey}</div>
                        <div className="text-muted-foreground">
                          {row.publishedThisMonth}/{row.goal} publicadas
                          {row.met ? " · meta cumprida" : ""}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="publishedThisMonth"
                  name="publicadas"
                  radius={[3, 3, 0, 0]}
                  shape={(props: { x?: number; y?: number; width?: number; height?: number; payload?: { met?: boolean; isCurrent?: boolean } }) => {
                    const { x, y, width, height, payload } = props;
                    const color = payload?.met
                      ? "rgb(16 185 129)"
                      : payload?.isCurrent
                        ? "rgb(245 158 11)"
                        : "rgba(192,132,252,0.55)";
                    return <rect x={x ?? 0} y={y ?? 0} width={width ?? 0} height={height ?? 0} fill={color} rx={3} />;
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lista mês a mês */}
        <h2 className="mt-6 mb-2 text-sm font-semibold text-foreground">Mês a mês</h2>
        {historyQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum registro de produção ainda. Fixe ideias no quadro Kanban e marque como publicada para começar o histórico.
          </div>
        ) : (
          <div className="space-y-2">
            {[...history].reverse().map((month) => (
              <div
                key={month.monthKey}
                className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-[12px] transition-colors ${
                  month.isCurrent
                    ? "border-primary/50 bg-primary/5"
                    : month.met
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-border bg-card/50 opacity-80"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="min-w-32 font-medium text-foreground">
                  {month.label}
                  {month.isCurrent && (
                    <Badge variant="outline" className="ml-1.5 border-primary/40 bg-transparent px-1.5 py-0 text-[9px] text-primary">
                      mês atual
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Target className="h-3 w-3 text-amber-500" />
                  meta {month.goal}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span className={month.publishedThisMonth >= month.goal ? "font-semibold text-emerald-500" : "text-foreground"}>
                    {month.publishedThisMonth} publicada{month.publishedThisMonth === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {month.avgProductionDays === null
                    ? "média —"
                    : `média ${month.avgProductionDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`}
                </span>
                {month.isCurrent ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {Math.min(100, Math.round((month.publishedThisMonth / month.goal) * 100))}% concluído
                  </span>
                ) : month.met ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" /> meta cumprida
                  </span>
                ) : (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <XCircle className="h-3 w-3" /> não cumprida
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Ano em números (rodada 23): consolidação das metas do ano corrente */}
        <h2 className="mt-6 mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Award className="h-4 w-4 text-amber-500" />
          Ano em números · {year}
        </h2>
        {yearSummaryQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Publicações</div>
                <div className="mt-1 text-lg font-bold text-foreground">{sy?.totalPublished ?? 0}</div>
                <div className="text-[10px] text-muted-foreground">no ano</div>
              </div>
              <div className="rounded-md bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Metas cumpridas</div>
                <div className="mt-1 text-lg font-bold text-emerald-500">{sy?.totalGoalsMet ?? 0}</div>
                <div className="text-[10px] text-muted-foreground">meses do ano</div>
              </div>
              <div className="rounded-md bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Média de produção</div>
                <div className="mt-1 text-lg font-bold text-foreground">
                  {sy === undefined || sy.avgProductionDays === null ? "—" : `${sy.avgProductionDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`}
                </div>
                <div className="text-[10px] text-muted-foreground">por vídeo publicado</div>
              </div>
              <div className="rounded-md bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Melhor mês</div>
                <div className="mt-1 flex items-center gap-1 text-lg font-bold text-amber-500">
                  <Trophy className="h-4 w-4" />
                  {sy?.bestMonth ? `${sy.bestMonth.publishedThisMonth}` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">{sy?.bestMonth ? sy.bestMonth.label : "sem dados"}</div>
              </div>
            </div>
            {(sy?.months?.length ?? 0) > 0 ? (
              <div className="mt-3 space-y-1.5">
                {[...sy!.months].reverse().map((m) => (
                  <div key={m.monthKey} className="flex items-center gap-2 text-[11px]">
                    <span className="w-36 truncate text-muted-foreground capitalize">{m.label}</span>
                    <Progress value={Math.min(100, m.ratio)} className="h-2 flex-1" aria-label={`${m.label}: ${m.ratio}% da meta`} />
                    <span className={`w-14 text-right font-medium ${m.met ? "text-emerald-500" : "text-muted-foreground"}`}>
                      {m.publishedThisMonth}/{m.goal}
                    </span>
                    <GoalBadge
                      variant={m.isCurrent ? "outline" : m.met ? "default" : "secondary"}
                      className="w-28 justify-center px-1.5 text-[9px]"
                    >
                      {m.isCurrent ? "mês atual" : m.met ? "meta cumprida" : "não cumprida"}
                    </GoalBadge>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Comparar com:</span>
                <div className="flex rounded-md border border-border p-0.5">
                  {[2025, 2026].filter((y) => y !== year).map((y) => (
                    <button
                      key={y}
                      type="button"
                      className={`px-2 py-0.5 text-[10px] transition-colors ${
                        compareYear === y ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setCompareYear(compareYear === y ? null : y)}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={exportYearMutation.isPending}
                onClick={() => exportYearMutation.mutate({ year })}
              >
                {exportYearMutation.isPending ? (
                  <FileDown className="mr-1.5 h-3.5 w-3.5 animate-spin opacity-70" />
                ) : (
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                )}
                Exportar ano em PDF
              </Button>
            </div>
            {ag && ag.yearComplete ? (
              <div className="mt-3 flex items-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                <Award className="h-6 w-6 shrink-0 text-amber-500" />
                <div>
                  <div className="text-[12px] font-bold text-amber-500">SELO · ANO COMPLETO {year}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Todos os meses do ano cumpriram a meta — {ag.published}/{ag.annualGoal} publicações, {ag.metMonths} de
                    {" "}{ag.monthsCounted} metas cumpridas.
                  </div>
                </div>
              </div>
            ) : ag ? (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-36 text-muted-foreground">Meta anual {year}</span>
                  <Progress value={Math.min(100, ag.progressRatio)} className="h-2 flex-1" aria-label={`Meta anual ${year}: ${ag.progressRatio}%`} />
                  <span className="w-20 text-right font-medium text-foreground">{ag.published}/{ag.annualGoal}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ag.metMonths} de {ag.monthsCounted} meses com a meta cumprida
                  {ag.yearComplete ? " · ano completo" : ""}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Comparativo de anos (rodada 24): evolução {compareYear} → {year} */}
        {compareYear !== null && compareQuery.data && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Comparativo {compareYear} → {year}
              </h3>
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setCompareYear(null)}
              >
                fechar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Publicações",
                  value: `${compareQuery.data.previous.published} → ${compareQuery.data.current.published}`,
                  delta: compareQuery.data.deltaPublished,
                },
                {
                  label: "Metas cumpridas",
                  value: `${compareQuery.data.previous.metMonths} → ${compareQuery.data.current.metMonths}`,
                  delta: compareQuery.data.deltaMetMonths,
                },
                {
                  label: "Meta anual",
                  value: `${compareQuery.data.previous.annualGoal} → ${compareQuery.data.current.annualGoal}`,
                  delta: compareQuery.data.deltaAnnualGoal,
                },
                {
                  label: "Resultado",
                  value: compareQuery.data.currentBetter ? "Evoluiu" : compareQuery.data.deltaPublished === 0 ? "Estável" : "Recuou",
                  delta: null,
                },
              ].map((tile) => (
                <div key={tile.label} className="rounded-md bg-card/50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tile.label}</div>
                  <div className="mt-1 flex items-center gap-1 text-[13px] font-bold text-foreground">
                    {tile.delta !== null && tile.delta !== 0 ? (
                      tile.delta > 0 ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                      )
                    ) : tile.delta === 0 ? (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                    {tile.value}
                  </div>
                  {tile.delta !== null ? (
                    <div className={`text-[10px] ${tile.delta > 0 ? "text-emerald-500" : tile.delta < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                      {tile.delta > 0 ? "+" : ""}{tile.delta}
                      {tile.delta !== 0 ? " vs ano anterior" : " sem variação"}
                    </div>
                  ) : null}
                                </div>
              ))}
            </div>
            {/* Gráfico mês a mês (rodada 25): barras lado a lado de {compareYear} vs {year} */}
            {compareByMonthQuery.data && compareByMonthQuery.data.months.length > 0 && (
              <div className="mt-4">
                {/* Toggle (rodada 26): publicações absolutas vs % da meta mensal */}
                <div className="mb-2 flex items-center justify-end gap-1 rounded-md border border-border p-0.5 text-[11px] w-fit ml-auto">
                  <button
                    type="button"
                    className={`rounded px-2 py-0.5 transition-colors ${compareMode === "published" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setCompareMode("published")}
                  >
                    Publicações
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-0.5 transition-colors ${compareMode === "percent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setCompareMode("percent")}
                  >
                    % da meta
                  </button>
                </div>
                <div className="mb-2 flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-purple-500/70" />
                    {compareByMonthQuery.data.previousYear}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-primary/80" />
                    {compareByMonthQuery.data.currentYear}
                  </span>
                </div>
                {/* Marcações de selos de trimestre (rodada 28): meses em que o trimestre do ano corrente foi concluído ganham "★" âmbar no rótulo. */}
                {(() => {
                  const qSeals = new Set(
                    (intermediateQuery.data?.quarters ?? [])
                      .filter((q) => q.year === (compareByMonthQuery.data?.currentYear ?? year))
                      .filter((q) => q.metMonths === 3)
                      .flatMap((q) => Array.from({ length: 3 }, (_, i) => q.quarter * 3 - 2 + i)),
                  );
                  const chartData = (compareByMonthQuery.data.months ?? []).map((m, i) => ({
                    ...m,
                    prevValue: compareMode === "percent" ? (m.previous.goal > 0 ? Math.round((m.previous.published / m.previous.goal) * 100) : 0) : m.previous.published,
                    currValue: compareMode === "percent" ? (m.current.goal > 0 ? Math.round((m.current.published / m.current.goal) * 100) : 0) : m.current.published,
                    quarterSeal: qSeals.has(i + 1),
                  }));
                  return (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} tickFormatter={(label: string, idx: number) => (chartData[idx]?.quarterSeal ? `${label} ★` : label)} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={22} />
                        <ChartTooltip
                          cursor={{ fill: "rgba(255,255,255,0.05)" }}
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 11, borderRadius: 6 }}
                          formatter={(value: number, name: string) => [
                            compareMode === "percent" ? `${value}%` : value,
                            name === "previous" ? String(compareByMonthQuery.data!.previousYear) : String(compareByMonthQuery.data!.currentYear),
                          ]}
                        />
                        <Bar dataKey="prevValue" name="previous" fill="rgba(168,85,247,0.7)" radius={[2, 2, 0, 0]} maxBarSize={14} />
                        <Bar dataKey="currValue" name="current" fill="hsl(38 92% 50%)" radius={[2, 2, 0, 0]} maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
                <div className="mt-1 flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
                  <span>{compareMode === "percent" ? "% da meta mensal por mês" : "Publicações por mês"} · {compareYear ?? year - 1} vs {year}</span>
                  <span className="text-amber-400">★ = selo de trimestre conquistado no ano corrente</span>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Galeria de conquistas (rodada 25): selos de "Ano Completo" acumulados */}
        {(achievementsQuery.data?.badges.length ?? 0) > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Trophy className="h-4 w-4 text-amber-500" />
                Galeria de conquistas
              </h2>
              {/* Botão de exportação do PDF dedicado de conquistas (rodada 28): anuais + intermediárias. */}
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={exportAchievementsMutation.isPending}
                onClick={() => exportAchievementsMutation.mutate()}
              >
                {exportAchievementsMutation.isPending ? (
                  <FileDown className="mr-1.5 h-3.5 w-3.5 animate-spin opacity-70" />
                ) : (
                  <FileDown className="mr-1.5 h-3.5 w-3.5" />
                )}
                Exportar conquistas em PDF
              </Button>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              {achievementsQuery.data ? `${achievementsQuery.data.badges.length} de ${achievementsQuery.data.totalYearsChecked} anos analisados terminaram com a meta cumprida em todos os meses.` : ""}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(achievementsQuery.data?.badges ?? []).map((b) => (
                <div
                  key={b.year}
                  className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                >
                  <Award className="h-7 w-7 shrink-0 text-amber-500" />
                  <div>
                    <div className="text-[12px] font-bold text-amber-500">SELO · ANO COMPLETO {b.year}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {b.metMonths} de {b.metMonths} metas cumpridas · {b.published}/{b.annualGoal} publicações
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Trimestre atual em andamento (rodada 27): progresso das metas mensais do trimestre corrente. */}
        {(() => {
          const now = new Date();
          const quarterIdx = Math.floor(now.getMonth() / 3); // 0–3
          const qLabel = ["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"][quarterIdx];
          const startMonth = quarterIdx * 3 + 1; // 1º mês do trimestre corrente (1, 4, 7 ou 10)
          const monthsInQ = Array.from({ length: 3 }, (_, i) => `${now.getFullYear()}-${String(startMonth + i).padStart(2, "0")}`);
          const qMonths = (sy?.months ?? []).filter((m) => monthsInQ.includes(m.monthKey));
          const passed = qMonths.filter((m) => !m.isCurrent);
          const metPassed = passed.filter((m) => m.met).length;
          const total = qMonths.length;
          if (total > 0 && passed.length > 0) {
            const pct = Math.round((metPassed / total) * 100);
            const done = metPassed === passed.length;
            return (
              <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-bold text-emerald-400">
                    <CalendarDays className="h-4 w-4" />
                    TRIMESTRE ATUAL · {qLabel.toUpperCase()} · {now.getFullYear()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {done
                      ? "Metas do trimestre cumpridas"
                      : `${metPassed}/${total} metas cumpridas (${pct}%)`}
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-500" : pct >= 50 ? "bg-emerald-500/80" : "bg-amber-500/70"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }
          return null;
        })()}
        {/* Semestre atual em andamento (rodada 28): progresso das metas mensais do semestre corrente (H1=1–6, H2=7–12). */}
        {(() => {
          const now = new Date();
          const halfIdx = now.getMonth() >= 6 ? 1 : 0; // 0 = H1, 1 = H2
          const hLabel = halfIdx === 0 ? "1º semestre" : "2º semestre";
          const startMonth = halfIdx * 6 + 1; // 1 (H1) ou 7 (H2)
          const monthsInH = Array.from({ length: 6 }, (_, i) =>
            `${now.getFullYear()}-${String(startMonth + i).padStart(2, "0")}`,
          );
          const hMonths = (sy?.months ?? []).filter((m) => monthsInH.includes(m.monthKey));
          const passed = hMonths.filter((m) => !m.isCurrent);
          const metPassed = passed.filter((m) => m.met).length;
          const total = hMonths.length;
          if (total > 0 && passed.length > 0) {
            const pct = Math.round((metPassed / total) * 100);
            const done = metPassed === passed.length;
            return (
              <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[12px] font-bold text-emerald-400">
                    <CalendarDays className="h-4 w-4" />
                    SEMESTRE ATUAL · {hLabel.toUpperCase()} · {now.getFullYear()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {done ? "Metas do semestre cumpridas" : `${metPassed}/${total} metas cumpridas (${pct}%)`}
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${done ? "bg-emerald-500" : pct >= 50 ? "bg-emerald-500/80" : "bg-amber-500/70"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }
          return null;
        })()}
        {/* Conquistas intermediárias (rodada 26): semestres e trimestres completos */}
        {((intermediateQuery.data?.halfYears.length ?? 0) > 0 || (intermediateQuery.data?.quarters.length ?? 0) > 0) && (
          <div className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Medal className="h-4 w-4 text-amber-500" />
              Conquistas intermediárias
            </h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              {intermediateQuery.data
                ? `${(intermediateQuery.data.quarters.length ?? 0) + (intermediateQuery.data.halfYears.length ?? 0)} selos intermediários acumulados em ${intermediateQuery.data.yearsChecked} ano${intermediateQuery.data.yearsChecked === 1 ? "" : "s"} analisado${intermediateQuery.data.yearsChecked === 1 ? "" : "s"}.`
                : ""}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(intermediateQuery.data?.halfYears ?? []).map((h) => (
                <div
                  key={`h${h.year}-${h.half}`}
                  className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-3"
                >
                  <Medal className="h-6 w-6 shrink-0 text-amber-400" />
                  <div>
                    <div className="text-[12px] font-bold text-amber-400">SELO · {h.label.toUpperCase()}</div>
                    <div className="text-[10px] text-muted-foreground">
                      6 de 6 metas cumpridas · {h.published}/{h.annualGoal} publicações
                    </div>
                  </div>
                </div>
              ))}
              {(intermediateQuery.data?.quarters ?? []).map((q) => (
                <div
                  key={`q${q.year}-${q.quarter}`}
                  className="flex items-center gap-3 rounded-md border border-amber-500/25 bg-amber-500/[0.04] p-3"
                >
                  <CalendarDays className="h-6 w-6 shrink-0 text-amber-300/90" />
                  <div>
                    <div className="text-[12px] font-bold text-amber-300/90">SELO · {q.label.toUpperCase()}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {q.metMonths} de {q.metMonths} metas cumpridas · {q.published}/{q.annualGoal} publicações
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Persistência da celebração (rodada 23): rever os confetes de metas atingidas.
            O GoalCelebrationView usa hooks internos, então deve ser renderizado SEMPRE
            (nunca dentro de bloco condicional) — a visibilidade é controlada pela prop show. */}
        <GoalCelebrationView
          triggerKey={replayCount}
          show={(celebrationsQuery.data?.length ?? 0) > 0}
        />
        {(celebrationsQuery.data?.length ?? 0) > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <PartyPopper className="h-4 w-4 text-emerald-500" />
              Metas celebradas
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={markReachedMutation.isPending}
                onClick={() => setReplayCount((c: number) => c + 1)}
                title="Reviver a animação de confetes da última meta atingida"
              >
                <PartyPopper className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                Rever confetes
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {(celebrationsQuery.data ?? []).length} {" "}
                {celebrationsQuery.data?.length === 1 ? "celebração registrada" : "celebrações registradas"} no servidor
                {celebrationsQuery.data?.[0] ? ` · última: ${celebrationsQuery.data[0].monthKey} (meta ${celebrationsQuery.data[0].goal})` : ""}
              </span>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/ideia-do-dia")}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Voltar ao quadro Kanban
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
