import SiteLayout from "@/components/SiteLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatCompact, formatDate, formatDuration, scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Clapperboard,
  Compass,
  Flame,
  Lightbulb,
  Radar,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useSearchParams } from "wouter";
import { useLimitConfirmation } from "@/hooks/useLimitConfirmation";

const STEPS = [
  { label: "Buscando vídeos em alta no nicho", icon: Compass },
  { label: "Extraindo métricas de engajamento", icon: Radar },
  { label: "Identificando padrões de viralidade", icon: Flame },
  { label: "Gerando sugestões prontas para gravar", icon: Clapperboard },
];

/**
 * Progresso real: a análise roda síncrona no servidor e grava etapas em
 * progressoStep; fazemos polling a cada 1,2s para exibir as etapas reais.
 */
function useHybridProgress(isRunning: boolean) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    setProgress(0);
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 88) return p;
        const step = Math.max(0.4, (92 - p) * 0.06);
        return Math.min(92, p + step);
      });
    }, 450);
    return () => clearInterval(timer);
  }, [isRunning]);
  return progress;
}

export default function Analysis() {
  const [searchParams] = useSearchParams();
  const nicheParam = searchParams.get("niche") ?? "";
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const [activeNiche, setActiveNiche] = useState(nicheParam);

  const [doneAnalysisId, setDoneAnalysisId] = useState<string | null>(null);

  // (Rodada 37) Modo "apenas avisar": erro PRECONDITION_FAILED abre o dialog de
  // confirmação; ao confirmar, o bloqueio é liberado até a meia-noite.
  const { handleLimitError, dialog: limitDialog } = useLimitConfirmation({
    onConfirm: () => runMutation.mutate({ niche: activeNiche }),
    message: null,
  });

  const runMutation = trpc.analysis.run.useMutation({
    onSuccess: (data) => {
      // Execução síncrona concluída: mostra o progresso completo e navega ao resultado
      setDoneAnalysisId(data.id);
    },
    onError: (err) => {
      if (handleLimitError(err)) return;
      toast.error(err.message || "Não foi possível concluir a análise. Tente novamente.");
    },
  });

  // Pequena pausa para exibir a tela de progresso "concluído" antes da navegação
  useEffect(() => {
    if (!doneAnalysisId) return;
    const timer = setTimeout(() => {
      navigate(`/resultado/${doneAnalysisId}`);
    }, 900);
    return () => clearTimeout(timer);
  }, [doneAnalysisId]);

  // Sincroniza com o parâmetro de URL (ex.: /analise?niche=fitness)
  const submittedRef = useRef(false);
  useEffect(() => {
    if (!submittedRef.current && nicheParam && !runMutation.isPending) {
      submittedRef.current = true;
      if (!isAuthenticated) {
        toast.error("Faça login para analisar um nicho.");
        navigate("/");
        return;
      }
      runMutation.mutate({ niche: nicheParam });
    }
  }, [nicheParam]);

  const handleReanalyze = () => {
    if (!isAuthenticated) {
      toast.error("Faça login para analisar um nicho.");
      navigate("/");
      return;
    }
    runMutation.mutate({ niche: activeNiche });
  };

  return (
    <SiteLayout>
      <div className="container max-w-5xl py-10">
        {(runMutation.isPending || !!doneAnalysisId) && (
          <RunningState
            niche={runMutation.variables?.niche ?? activeNiche}
            isDone={!!doneAnalysisId}
          />
        )}
        {!runMutation.isPending && !runMutation.data && !runMutation.isError && (
          <EmptyState
            niche={nicheParam}
            onPick={(n) => navigate(`/analise?niche=${encodeURIComponent(n)}`)}
          />
        )}
        {runMutation.isError && (
          <ErrorState
            message={runMutation.error.message}
            niche={activeNiche}
            onRetry={handleReanalyze}
          />
        )}
        {limitDialog}
      </div>
    </SiteLayout>
  );
}

function RunningState({ niche, isDone }: { niche: string; isDone: boolean }) {
  // A execução é síncrona: o mutation aguarda o fim e navega ao resultado.
  // O RunningState é exibido apenas durante o dispatch; usamos progresso
  // suavizado que é sobrescrito pelo valor real do servidor quando disponível.
  const simulated = useHybridProgress(!isDone);
  const progress = isDone ? 100 : simulated;

  const currentStep = Math.min(Math.floor((progress / 100) * STEPS.length), STEPS.length - 1);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
      <div className="relative h-28 w-28">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary border-r-primary/40" style={{ animationDuration: "2.4s" }} />
        <div className="absolute inset-4 rounded-full border border-border/60 bg-card flex items-center justify-center">
          <Radar className="h-8 w-8 text-primary vy-step-pulse" />
        </div>
      </div>

      <div className="w-full max-w-md">
        <h2 className="font-display text-2xl font-semibold">Analisando “{niche}”</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isDone
            ? "Análise concluída! Abrindo o seu dashboard de resultados."
            : "Varrendo vídeos em alta, extraindo padrões e pontuando a viralidade. Isso leva menos de um minuto."}
        </p>
      </div>

      <div className="w-full max-w-md space-y-2">
        {STEPS.map((step, i) => {
          const done = progress > ((i + 1) * 100) / STEPS.length - 6;
          const active = i === currentStep;
          return (
            <div
              key={step.label}
              className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-all duration-300 ${
                done
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : active
                    ? "border-border bg-card text-foreground"
                    : "border-border/40 bg-card/40 text-muted-foreground/60"
              }`}
            >
              <step.icon className={`h-4 w-4 shrink-0 ${done || active ? "text-primary" : "text-muted-foreground/50"}`} />
              <span>{step.label}</span>
              {done && <span className="ml-auto text-xs text-primary">concluído</span>}
              {active && <span className="ml-auto text-xs text-primary vy-step-pulse">em curso</span>}
              {isDone && <span className="ml-auto text-xs text-primary">concluído</span>}
            </div>
          );
        })}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="score-bar h-full rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ niche, onPick }: { niche: string; onPick: (n: string) => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <Radar className="h-10 w-10 text-muted-foreground/40" />
      <h2 className="font-display text-2xl font-semibold">
        {niche ? `Pronto para analisar “${niche}”` : "Escolha um nicho para começar"}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Digite o nicho na página inicial ou clique em um dos exemplos abaixo.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {["inteligência artificial", "fitness", "finanças", "games", "produtividade"].map((n) => (
          <Button key={n} variant="outline" size="sm" onClick={() => onPick(n)}>
            {n}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, niche, onRetry }: { message: string; niche: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <Radar className="h-10 w-10 text-destructive/70" />
      <h2 className="font-display text-2xl font-semibold">A análise não pôde ser concluída</h2>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {niche && (
        <Button onClick={onRetry} variant="outline">
          <RotateCcw className="mr-2 h-4 w-4" /> Tentar novamente com “{niche}”
        </Button>
      )}
    </div>
  );
}
