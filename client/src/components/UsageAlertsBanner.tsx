import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

/**
 * (Rodada 38) Banner global de alertas de uso: exibe proativamente os alertas
 * in-app emitidos pelo backend quando o consumo atinge 80% (aviso) ou 100%
 * (bloqueio) de qualquer limite diário. Cada alerta tem botão de dismiss
 * (markAlertRead) e link para a página /uso.
 */
export function UsageAlertsBanner() {
  const utils = trpc.useUtils();
  const alertsQuery = trpc.profile.listUsageAlerts.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const markReadMutation = trpc.profile.markAlertRead.useMutation({
    onSuccess: () => void utils.profile.listUsageAlerts.invalidate(),
  });

  // Mostra um toast ao receber novos alertas não vistos ainda na sessão.
  const [seenKeys, setSeenKeys] = useState<Set<number>>(new Set());
  const alerts = alertsQuery.data ?? [];

  useEffect(() => {
    const incoming = alerts.filter((a) => !seenKeys.has(a.id));
    for (const a of incoming) {
      const dimLabel = dimLabelFor(a.dimension);
      const blocked = a.level === "blocked";
      toast.warning(
        blocked ? `Limite atingido: ${dimLabel}` : `Atenção: ${dimLabel} atingiu 80% do limite.`,
      );
    }
    if (incoming.length > 0) {
      setSeenKeys((prev) => new Set(Array.from(prev).concat(incoming.map((a) => a.id))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.length]);

  if (alerts.length === 0) return null;

  return (
    <div className="container max-w-4xl px-4">
      {alerts.slice(0, 2).map((a) => {
        const blocked = a.level === "blocked";
        const dimLabel = dimLabelFor(a.dimension);
        const consumptionLabel = formatConsumption(a.dimension, a.currentUsage, a.limitValue);
        return (
          <Alert
            key={a.id}
            variant={blocked ? "destructive" : "default"}
            className={`mt-3 ${!blocked ? "border-amber-400/60 bg-amber-500/10" : ""}`}
          >
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertDescription className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1">
                <span className="font-medium">{blocked ? "Limite atingido — " : "Alerta de uso — "}</span>
                {dimLabel}. Consumo atual: {consumptionLabel}.{" "}
                {blocked ? (
                  a.dimension === "weekly_cost_cap" ? (
                    <>Novas análises podem estar suspensas conforme o modo configurado (bloquear, avisar ou notificar). </>
                  ) : (
                    <>As análises estão suspensas até a meia-noite. </>
                  )
                ) : (
                  <>Você pode atingir o bloqueio em breve. </>
                )}
                Revise em{" "}
                <Link href="/uso" className="underline underline-offset-2">
                  Uso
                </Link>
                .
              </span>
              <button
                type="button"
                onClick={() => markReadMutation.mutate({ alertId: a.id })}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Dispensar alerta"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}

const DIM_LABEL: Record<string, string> = {
  analyses: "Análises do dia",
  tokens: "Tokens LLM do dia",
  quota: "Cota YouTube do dia",
  cost_cap: "Custo mensal (R$)",
  weekly_cost_cap: "Custo semanal (R$)",
};
/** (Rodada 42) Mensagens por dimensão: os tetos de custo usam moeda (R$) em
 * vez de contagens, então o consumo/limite é formatado como valor monetário. */
function formatConsumption(dimension: string, value: number, limitValue: number): string {
  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (dimension === "cost_cap" || dimension === "weekly_cost_cap") {
    return `${fmt(value)} de ${fmt(limitValue)}`;
  }
  return `${value.toLocaleString("pt-BR")} de ${limitValue.toLocaleString("pt-BR")}`;
}

function dimLabelFor(dimension: string): string {
  return DIM_LABEL[dimension] ?? dimension;
}
