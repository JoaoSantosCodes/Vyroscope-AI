import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as ChartTooltip } from "recharts";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  CheckCircle2,
  Flame,
  Target,
  XCircle,
  CalendarDays,
} from "lucide-react";

export default function Streaks() {
  const { isAuthenticated } = useAuth();
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

  if (!isAuthenticated) return null;

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

        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Flame className="h-6 w-6 text-amber-500" />
          Histórico de metas mensais
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhamento mês a mês: meta configurada, publicações realizadas e se a meta foi cumprida.
        </p>

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
