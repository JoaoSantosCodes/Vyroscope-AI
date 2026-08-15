import { useState } from "react";
import SiteLayout from "@/components/SiteLayout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  ClipboardCopy,
  FileText,
  Lightbulb,
  Loader2,
  Radar,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OutlineData = {
  niche: string;
  analysisId: string;
  suggestion: { title: string; viralityScore: number | null; hook?: string; angle?: string; targetLength?: string };
  outline: { title: string; totalLength: string; acts: { act: string; label: string; duration: string; points: string[]; keyLine: string }[]; notes: string[] };
};

/** Modal do esboço de roteiro (mesmo estilo do painel "Ideia do dia" da home). */
function OutlineDialog({
  outline,
  onOpenChange,
}: {
  outline: OutlineData | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(outline)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Esboço de roteiro</DialogTitle>
        </DialogHeader>
        {outline && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Título: </strong>
              {outline.suggestion.title}
            </p>
            <p className="text-xs text-muted-foreground">
              Duração estimada: {outline.outline.totalLength} · Nicho: {outline.niche}
            </p>
            <Accordion type="single" collapsible>
              {outline.outline.acts.map((act, i) => (
                <AccordionItem key={act.act} value={act.act}>
                  <AccordionTrigger className="text-sm">
                    {i + 1}. {act.label}{" "}
                    <span className="text-xs text-muted-foreground">({act.duration})</span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {act.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    <p className="border-l-2 border-primary/50 pl-2.5 text-xs italic text-muted-foreground">
                      {act.keyLine}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            {outline.outline.notes.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {outline.outline.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button
                size="sm"
                onClick={() => {
                  const text = [
                    outline.suggestion.title,
                    "",
                    ...outline.outline.acts.map((act, i) =>
                      [`${i + 1}. ${act.label} (${act.duration})`, ...act.points, `Frase-chave: ${act.keyLine}`].join("\n")
                    ),
                    "",
                    "Notas: " + outline.outline.notes.join("; "),
                  ].join("\n");
                  navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success("Esboço copiado."))
                    .catch(() => toast.error("Não foi possível copiar."));
                }}
              >
                <ClipboardCopy className="mr-2 h-3.5 w-3.5" /> Copiar esboço
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function IdeaHistory() {
  const [, navigate] = useLocation();
  const historyQuery = trpc.extended.ideaHistory.useQuery({ limit: 30 });
  const [outline, setOutline] = useState<OutlineData | null>(null);
  const [outlineDialogOpen, setOutlineDialogOpen] = useState(false);
  const outlineMutation = trpc.extended.generateIdeaOutline.useMutation({
    onSuccess: (data) => {
      setOutline(data);
      setOutlineDialogOpen(true);
      toast.success("Esboço de roteiro gerado.");
    },
    onError: (err) => toast.error(err.message || "Falha ao gerar o esboço."),
  });

  const ideas = historyQuery.data?.ideas ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const primaryNiche = ideas[0]?.niche;

  const handleCopy = (idea: (typeof ideas)[number]) => {
    navigator.clipboard
      .writeText(
        `${idea.suggestion.title}${idea.suggestion.hook ? `\nHook: ${idea.suggestion.hook}` : ""}`
      )
      .then(() => toast.success("Título e hook copiados."))
      .catch(() => toast.error("Não foi possível copiar."));
  };

  const handleOutline = (idea: (typeof ideas)[number]) => {
    outlineMutation.mutate({ analysisId: idea.analysisId, suggestionTitle: idea.suggestion.title });
  };

  return (
    <SiteLayout>
      <div className="container py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Ideia do dia</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Histórico de ideias</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {primaryNiche
              ? `As sugestões que já passaram pelo seu painel "Ideia do dia" (${primaryNiche}), rotacionadas por data. Revise qualquer uma e gere esboço de roteiro quando quiser.`
              : `O painel "Ideia do dia" rotaciona automaticamente uma sugestão do seu nicho principal a cada dia. Aqui você revisita as que já apareceram.`}
          </p>
        </div>

        {historyQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : ideas.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
              <Lightbulb className="h-9 w-9 text-primary" />
              <p className="max-w-md text-sm text-muted-foreground">
                Ainda não há ideias no seu histórico. Conclua análises no seu nicho principal e o
                painel "Ideia do dia" começará a rotacionar sugestões diariamente.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                Fazer uma análise
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ideas.map((idea) => {
              const isToday = idea.date === today;
              return (
                <Card
                  key={`${idea.date}-${idea.suggestion.title}`}
                  className={`flex flex-col border-primary/20 bg-gradient-to-br from-card to-accent/5 ${isToday ? "ring-1 ring-primary/60" : ""}`}
                >
                  <CardContent className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-bold ${scoreColor(idea.suggestion.viralityScore ?? 0)} border-current/25 bg-accent/50`}
                      >
                        {idea.suggestion.viralityScore} · {scoreLabel(idea.suggestion.viralityScore ?? 0)}
                      </span>
                      {isToday && (
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                          Hoje
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-3 font-display text-lg font-semibold leading-snug">
                      {idea.suggestion.title}
                    </h3>
                    {idea.suggestion.hook && (
                      <blockquote className="mt-2 border-l-2 border-primary/50 pl-2.5 text-xs italic leading-relaxed text-muted-foreground">
                        {idea.suggestion.hook}
                      </blockquote>
                    )}
                    {idea.suggestion.angle && (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">Ângulo: </strong>
                        {idea.suggestion.angle}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 text-xs"
                        disabled={outlineMutation.isPending}
                        onClick={() => handleOutline(idea)}
                      >
                        {outlineMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        Esboço
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleCopy(idea)}
                      >
                        <ClipboardCopy className="h-3 w-3" /> Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => navigate(`/resultado/${idea.analysisId}`)}
                      >
                        <Radar className="h-3 w-3" /> Análise
                      </Button>
                    </div>
                    <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(new Date(idea.date + "T12:00:00").getTime())} · {idea.niche}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <OutlineDialog outline={outline} onOpenChange={(open) => !open && setOutline(null)} />
    </SiteLayout>
  );
}
