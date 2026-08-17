import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportUsagePdf } from "@/lib/export";
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
  ChartNoAxesCombined,
  Flame,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import SiteLayout from "../components/SiteLayout";

type DaysRange = 7 | 14 | 30 | 60 | 90;

function avgSeries(values: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(Number((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(0)));
  }
  return out;
}

export default function Usage() {
  const { isAuthenticated } = useAuth();
  const [days, setDays] = useState<DaysRange>(30);
  const utils = trpc.useUtils();

  const seriesQuery = trpc.profile.getUsageDailySeries.useQuery(
    { days },
    { enabled: isAuthenticated, staleTime: 60_000 }
  );
  const limitsQuery = trpc.profile.getLimits.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const chartData = useMemo(() => {
    const series = seriesQuery.data;
    if (!series) return [];
    const byDate = new Map<string, { llmTokens: number; ytUnits: number }>();
    for (const p of series.llm) {
      const prev = byDate.get(p.date) ?? { llmTokens: 0, ytUnits: 0 };
      byDate.set(p.date, { llmTokens: prev.llmTokens + p.tokens, ytUnits: prev.ytUnits });
    }
    for (const p of series.youtube) {
      const prev = byDate.get(p.date) ?? { llmTokens: 0, ytUnits: 0 };
      byDate.set(p.date, { llmTokens: prev.llmTokens, ytUnits: prev.ytUnits + p.units });
    }
    return series.llm.map((p) => {
      const day = byDate.get(p.date) ?? { llmTokens: 0, ytUnits: 0 };
      const limit = series.limitByDay.find((l) => l.date === p.date);
      return {
        date: p.date.slice(5),
        fullDate: p.date,
        tokens: day.llmTokens,
        units: day.ytUnits,
        tokenAvg: 0, // preenchido abaixo
        unitAvg: 0,
        tokenLimit: limit?.tokens ?? 0,
        unitLimit: limit?.quota ?? 0,
      };
    }).map((row, idx, all) => {
      const tokenAvg = avgSeries(all.map((r) => r.tokens), 7)[idx];
      const unitAvg = avgSeries(all.map((r) => r.units), 7)[idx];
      return { ...row, tokenAvg, unitAvg };
    });
  }, [seriesQuery.data]);

  const tokenAvg = useMemo(
    () => (chartData.length ? Math.round(chartData.reduce((a, r) => a + r.tokens, 0) / chartData.length) : 0),
    [chartData]
  );
  const unitAvg = useMemo(
    () => (chartData.length ? Math.round(chartData.reduce((a, r) => a + r.units, 0) / chartData.length) : 0),
    [chartData]
  );
  const totalTokens = useMemo(() => chartData.reduce((a, r) => a + r.tokens, 0), [chartData]);
  const totalUnits = useMemo(() => chartData.reduce((a, r) => a + r.units, 0), [chartData]);
  const peakTokens = useMemo(() => Math.max(0, ...chartData.map((r) => r.tokens)), [chartData]);
  const peakUnits = useMemo(() => Math.max(0, ...chartData.map((r) => r.units)), [chartData]);

  const limits = limitsQuery.data;
  const blockedAttemptsQuery = trpc.profile.listBlockedAttempts.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const isAnalysisWarn = limits?.state.analyses === "warn";
  const isAnalysisBlocked = limits?.state.analyses === "blocked";
  const isTokenWarn = limits?.state.tokens === "warn";
  const isTokenBlocked = limits?.state.tokens === "blocked";
  const isQuotaWarn = limits?.state.quota === "warn";
  const isQuotaBlocked = limits?.state.quota === "blocked";

  return (
    <SiteLayout>
      <div className="container max-w-5xl py-10 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary">Consumo</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">Uso diário</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Evolução do consumo de tokens de LLM e da cota do YouTube ao longo dos dias.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as DaysRange)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="60">60 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                seriesQuery.refetch();
                limitsQuery.refetch();
              }}
              disabled={seriesQuery.isRefetching || limitsQuery.isRefetching}
            >
              {seriesQuery.isRefetching || limitsQuery.isRefetching ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await exportUsagePdf(days);
                  toast.success("Relatório de uso exportado em PDF.");
                } catch {
                  toast.error("Falha ao gerar o PDF de uso.");
                }
              }}
            >
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Alertas de limite do dia corrente */}
        {(isAnalysisWarn || isAnalysisBlocked || isTokenWarn || isTokenBlocked || isQuotaWarn || isQuotaBlocked) && (
          <LimitAlertsBanner />
        )}

        {/* Resumo do período */}
        <div className="grid gap-4 sm:grid-cols-4">
          <PeriodCard
            icon={<Flame className="h-7 w-7 text-amber-400" />}
            label="Tokens LLM (total)"
            value={totalTokens.toLocaleString("pt-BR")}
            hint={`Média ${tokenAvg.toLocaleString("pt-BR")}/dia`}
          />
          <PeriodCard
            icon={<Video className="h-7 w-7 text-primary" />}
            label="Cota YouTube (unidades)"
            value={totalUnits.toLocaleString("pt-BR")}
            hint={`Média ${unitAvg.toLocaleString("pt-BR")}/dia`}
          />
          <PeriodCard
            icon={<TrendingUp className="h-7 w-7 text-emerald-400" />}
            label="Pico de tokens/dia"
            value={peakTokens.toLocaleString("pt-BR")}
            hint={formatDayPeak(chartData)}
          />
          <PeriodCard
            icon={<Gauge className="h-7 w-7 text-sky-400" />}
            label="Pico de cota/dia"
            value={peakUnits.toLocaleString("pt-BR")}
            hint={formatUnitPeak(chartData)}
          />
        </div>

        {/* Orçamentos semanal e mensal com projeção de esgotamento */}
        <div className="grid gap-4 lg:grid-cols-2">
          <BudgetCard
            title="Orçamento semanal"
            hint="Últimos 7 dias — tokens LLM e cota YouTube somados"
            budgets={limits?.budgets?.week}
          />
          <BudgetCard
            title="Orçamento mensal"
            hint="Do dia 1 do mês até hoje — tokens LLM e cota YouTube somados"
            budgets={limits?.budgets?.month}
          />
        </div>

        {/* Gráfico de tokens LLM */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-400" />
              Tokens de LLM por dia
            </CardTitle>
            <CardDescription>
              Consumo diário (barras), média móvel de 7 dias (linha) e o limite diário configurado, quando existir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {seriesQuery.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                <ChartNoAxesCombined className="h-10 w-10 opacity-50" />
                <p className="text-sm">Nenhum consumo registrado no período. Execute uma análise para começar.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 270)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "oklch(0.72 0.02 270)" }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "oklch(0.72 0.02 270)" }}
                    width={56}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.02 270)",
                      border: "1px solid oklch(0.32 0.02 270)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(label: string, payload) => {
                      const point = payload?.[0]?.payload as { fullDate?: string } | undefined;
                      return point?.fullDate ? formatDate(new Date(`${point.fullDate}T00:00:00`).getTime()) : label;
                    }}
                    formatter={(value: number, name: string) => formatTooltipRow(name, value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="tokens"
                    name="Tokens LLM"
                    fill="oklch(0.75 0.16 70)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    dataKey="tokenAvg"
                    name="Média 7 dias"
                    stroke="oklch(0.75 0.12 330)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine
                    y={limits?.limit.dailyTokenLimit && limits.limit.dailyTokenLimit > 0 ? limits.limit.dailyTokenLimit : undefined}
                    stroke="oklch(0.65 0.2 25)"
                    strokeDasharray="6 4"
                    label={limits?.limit.dailyTokenLimit ? { value: `Limite ${limits.limit.dailyTokenLimit.toLocaleString("pt-BR")}`, fill: "oklch(0.65 0.2 25)", fontSize: 11, position: "insideTopRight" } : undefined}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de cota YouTube */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Cota do YouTube por dia (unidades)
            </CardTitle>
            <CardDescription>
              Unidades da API do YouTube consumidas na coleta de vídeos em alta por dia, com a média móvel de 7 dias e o limite configurado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {seriesQuery.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center gap-2 text-muted-foreground">
                <ChartNoAxesCombined className="h-10 w-10 opacity-50" />
                <p className="text-sm">Nenhum consumo registrado no período.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.02 270)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "oklch(0.72 0.02 270)" }}
                    interval="preserveStartEnd"
                    minTickGap={28}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.72 0.02 270)" }} width={48} />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.02 270)",
                      border: "1px solid oklch(0.32 0.02 270)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={(label: string, payload) => {
                      const point = payload?.[0]?.payload as { fullDate?: string } | undefined;
                      return point?.fullDate ? formatDate(new Date(`${point.fullDate}T00:00:00`).getTime()) : label;
                    }}
                    formatter={(value: number, name: string) => formatTooltipRow(name, value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="units"
                    name="Unidades YouTube"
                    fill="oklch(0.65 0.14 220)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Line
                    dataKey="unitAvg"
                    name="Média 7 dias"
                    stroke="oklch(0.75 0.12 330)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine
                    y={limits?.limit.dailyQuotaLimit && limits.limit.dailyQuotaLimit > 0 ? limits.limit.dailyQuotaLimit : undefined}
                    stroke="oklch(0.65 0.2 25)"
                    strokeDasharray="6 4"
                    label={limits?.limit.dailyQuotaLimit ? { value: `Limite ${limits.limit.dailyQuotaLimit.toLocaleString("pt-BR")}`, fill: "oklch(0.65 0.2 25)", fontSize: 11, position: "insideTopRight" } : undefined}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Histórico de tentativas bloqueadas */}
        <BlockedAttemptsSection
          attempts={blockedAttemptsQuery.data ?? []}
          isLoading={blockedAttemptsQuery.isLoading}
        />

        <p className="text-xs text-muted-foreground">
          O limite de 80% exibe um alerta visual no perfil. No modo "Bloquear", novas análises são interrompidas ao
          atingir 100%; no modo "Apenas avisar", uma confirmação é solicitada (válida até a meia-noite). O contador de
          análises do dia considera todas as execuções realizadas, independentemente do status final. As tentativas
          bloqueadas ficam registradas nesta página para transparência.
        </p>
      </div>
    </SiteLayout>
  );
}

/** Banner de alertas de limite do dia corrente (usado tanto no /uso quanto reutilizável). */
export function LimitAlertsBanner() {
  const limitsQuery = trpc.profile.getLimits.useQuery(undefined, { staleTime: 30_000 });
  const limits = limitsQuery.data;
  if (!limits) return null;
  const { today, state, limit } = limits;
  const items: Array<{ label: string; value: string; cap: string; kind: "warn" | "blocked" }> = [];
  const push = (label: string, value: string, cap: string, kind: "warn" | "blocked") =>
    items.push({ label, value, cap, kind });
  if (state.analyses !== "ok") push("Análises hoje", String(today.analyses), String(limit.dailyAnalysisLimit), state.analyses);
  if (state.tokens !== "ok")
    push("Tokens LLM hoje", today.tokens.toLocaleString("pt-BR"), limit.dailyTokenLimit.toLocaleString("pt-BR"), state.tokens);
  if (state.quota !== "ok")
    push("Cota YouTube hoje", today.quota.toLocaleString("pt-BR"), limit.dailyQuotaLimit.toLocaleString("pt-BR"), state.quota);
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.label}
          className={`flex items-center gap-3 rounded-lg border p-3 ${
            item.kind === "blocked"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }`}
        >
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            <span className="font-semibold">{item.label}: {item.value}</span>{" "}
            {item.kind === "blocked"
              ? "— limite diário atingido. Novas análises estão bloqueadas até a meia-noite."
              : `— ${Math.round(
                  (Number(item.value.replace(/\./g, "")) / Number(item.cap.replace(/\./g, ""))) * 100
                )}% do limite diário (${item.cap}). Defina um limite maior em Limites e proteção de custos ou aguarde a virada do dia.`}
          </p>
        </div>
      ))}
    </div>
  );
}

const DIM_LABEL: Record<string, string> = {
  analyses: "Análises/dia",
  tokens: "Tokens LLM",
  quota: "Cota YouTube",
};

type Projection = { exhausted?: boolean; estimatedDayIso?: string | null; daysLeft?: number | null; pct?: number | null } | null;

function ProjectionRow(props: { projection: Projection }) {
  const { projection } = props;
  if (!projection || !projection.estimatedDayIso) {
    return <p className="mt-3 text-xs text-muted-foreground">Sem ritmo de consumo suficiente para projetar.</p>;
  }
  const date = formatDate(new Date(`${projection.estimatedDayIso}T00:00:00`).getTime());
  return (
    <div className={`mt-3 flex items-center gap-2 text-xs ${projection.exhausted ? "text-red-400" : "text-amber-300"}`}>
      <TrendingUp className="h-3.5 w-3.5 shrink-0" />
      <span>
        {projection.exhausted
          ? "Limite atingido pelo ritmo atual."
          : `No ritmo atual, o limite será atingido em ${date}${projection.daysLeft !== undefined ? ` (${projection.daysLeft} ${projection.daysLeft === 1 ? "dia" : "dias"})` : ""}.`}
      </span>
    </div>
  );
}

function BudgetCard(props: {
  title: string;
  hint: string;
  budgets?: { tokens: number; quota: number; tokenLimit?: number; quotaLimit?: number; tokenProjection?: Projection; quotaProjection?: Projection };
}) {
  const { budgets } = props;
  const hasLimits = Boolean((budgets?.tokenLimit ?? 0) || (budgets?.quotaLimit ?? 0));
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          {props.title}
        </CardTitle>
        <CardDescription>{props.hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasLimits ? (
          <p className="text-sm text-muted-foreground">
            Nenhum orçamento configurado. Defina limites semanais ou mensais em{" "}
            <span className="font-medium">Limites e proteção de custos</span> no perfil para ativar o acompanhamento
            e a projeção de esgotamento.
          </p>
        ) : (
          <>
            <BudgetRow
              label="Tokens LLM"
              consumed={budgets?.tokens ?? 0}
              cap={budgets?.tokenLimit ?? 0}
              projection={budgets?.tokenProjection ?? null}
            />
            <BudgetRow
              label="Cota YouTube (unidades)"
              consumed={budgets?.quota ?? 0}
              cap={budgets?.quotaLimit ?? 0}
              projection={budgets?.quotaProjection ?? null}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetRow(props: { label: string; consumed: number; cap: number; projection: Projection }) {
  const pct = props.cap > 0 ? Math.min(100, Math.round((props.consumed / props.cap) * 100)) : 0;
  const tone = props.cap > 0 && pct >= 80 ? ("red" as const) : ("primary" as const);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground/90">{props.label}</span>
        {props.cap > 0 ? (
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{props.consumed.toLocaleString("pt-BR")}</span> /{" "}
            {props.cap.toLocaleString("pt-BR")} ({pct}%)
          </span>
        ) : (
          <span className="text-muted-foreground">{props.consumed.toLocaleString("pt-BR")} (ilimitado)</span>
        )}
      </div>
      <Progress value={pct} className={tone === "red" ? "h-2 [&>div]:bg-red-500" : "h-2"} />
      <ProjectionRow projection={props.projection} />
    </div>
  );
}

function BlockedAttemptsSection(props: { attempts: Array<{ id: number; dimension: string; limitValue: number; currentUsage: number; reason: string | null; attemptedAt: number; niche: string | null; confirmedAt: number | null; analysisId: string | null }>; isLoading: boolean }) {
  const { attempts, isLoading } = props;
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Tentativas bloqueadas
        </CardTitle>
        <CardDescription>
          Histórico de análises interrompidas pela proteção de custos, incluindo as confirmadas manualmente no modo
          "Apenas avisar".
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : attempts.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 opacity-50" />
            <p className="text-sm">Nenhuma tentativa bloqueada registrada. Os limites estão saudáveis.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Dimensão</TableHead>
                  <TableHead className="text-xs text-right">Limite</TableHead>
                  <TableHead className="text-xs text-right">Consumo no momento</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDate(a.attemptedAt)}</TableCell>
                    <TableCell className="text-xs">{DIM_LABEL[a.dimension] ?? a.dimension}</TableCell>
                    <TableCell className="text-right text-xs">{a.limitValue.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-xs">{a.currentUsage.toLocaleString("pt-BR")}</TableCell>
                    <TableCell>
                      {a.confirmedAt ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">
                          Confirmada
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400">
                          Bloqueada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-muted-foreground" title={a.reason ?? undefined}>
                      {a.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodCard(props: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-4 p-5">
        {props.icon}
        <div>
          <p className="text-2xl font-bold">{props.value}</p>
          <p className="text-xs text-muted-foreground">{props.label}</p>
          {props.hint && (
            <Badge variant="secondary" className="mt-1 text-[10px]">
              {props.hint}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDayPeak(data: Array<{ fullDate: string; tokens: number }>): string {
  const peak = data.reduce((best, r) => (r.tokens > best.tokens ? r : best), { fullDate: "", tokens: 0 });
  return peak.fullDate ? formatDate(new Date(`${peak.fullDate}T00:00:00`).getTime()) : "—";
}

function formatUnitPeak(data: Array<{ fullDate: string; units: number }>): string {
  const peak = data.reduce((best, r) => (r.units > best.units ? r : best), { fullDate: "", units: 0 });
  return peak.fullDate ? formatDate(new Date(`${peak.fullDate}T00:00:00`).getTime()) : "—";
}

function formatTooltipRow(name: string, value: number | string): [string, string] {
  if (name.includes("Média")) return [name, `${value.toLocaleString("pt-BR")}/dia`];
  if (name.includes("YouTube")) return [name, `${value.toLocaleString("pt-BR")} unidades`];
  return [name, `${value.toLocaleString("pt-BR")} tokens`];
}
