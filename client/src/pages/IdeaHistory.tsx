import { useCallback, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { buildIdeaHistoryCsv, exportIdeaHistoryCsv } from "@/lib/export";
import { formatDate, scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import { FileText, Lightbulb, Loader2, Pin, PinOff, Radar, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OutlineData = {
  niche: string;
  analysisId: string;
  suggestion: { title: string; viralityScore: number | null; hook?: string; angle?: string; targetLength?: string };
  outline: { title: string; totalLength: string; acts: { act: string; label: string; duration: string; points: string[]; keyLine: string }[]; notes: string[] };
};

type HistoryIdea = {
  date: string;
  niche: string;
  analysisId: string;
  analysisDate: number;
  suggestion: { title: string; hook?: string; angle?: string; targetLength?: string; viralityScore: number | null; reasoning?: string };
};

type PinnedIdea = {
  id: number;
  date: string;
  analysisId: string;
  suggestionTitle: string;
  niche: string;
  viralityScore: number | null;
  sortOrder: number | null;
  notes: string | null;
  createdAt: Date;
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
                <FileText className="mr-2 h-3.5 w-3.5" /> Copiar esboço
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
  const [nicheFilter, setNicheFilter] = useState<string>("all");
  const [scoreMin, setScoreMin] = useState<string>("");
  const [scoreMax, setScoreMax] = useState<string>("");

  const historyQuery = trpc.extended.ideaHistory.useQuery({
    limit: 30,
    nicheFilter: nicheFilter === "all" ? undefined : nicheFilter,
    scoreMin: scoreMin ? parseInt(scoreMin, 10) : undefined,
    scoreMax: scoreMax ? parseInt(scoreMax, 10) : undefined,
  });
  const pinnedQuery = trpc.extended.listPinnedIdeas.useQuery(undefined, { refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
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

  const pinMutation = trpc.extended.pinIdeaHistory.useMutation({
    onMutate: async ({ date, analysisId, suggestionTitle, niche, viralityScore }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, { ideas: [{ id: 0, date, analysisId, suggestionTitle, niche, viralityScore, sortOrder: null, notes: null, createdAt: new Date() }, ...(prev?.ideas ?? [])] });
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] });
    },
    onSettled: () => {
      utils.extended.listPinnedIdeas.invalidate();
    },
    onSuccess: () => toast.success("Ideia fixada no topo do painel."),
  });

  const unpinMutation = trpc.extended.unpinIdeaHistory.useMutation({
    onMutate: async ({ pinnedId }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, { ideas: (prev?.ideas ?? []).filter((i) => i.id !== pinnedId) });
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] });
    },
    onSettled: () => {
      utils.extended.listPinnedIdeas.invalidate();
    },
    onSuccess: () => toast.success("Fixação removida."),
  });

  const exportMutation = trpc.extended.exportIdeaHistoryPdf.useMutation({
    onSuccess: (data) => {
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("PDF do histórico baixado.");
    },
    onError: (err) => toast.error(err.message || "Falha ao exportar o PDF."),
  });

  const ideas: HistoryIdea[] = historyQuery.data?.ideas ?? [];
  const pinned: PinnedIdea[] = pinnedQuery.data?.ideas ?? [];
  const niches = historyQuery.data?.filters?.niches ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const isPinned = (idea: HistoryIdea) =>
    pinned.some((p) => p.date === idea.date && p.analysisId === idea.analysisId && p.suggestionTitle === idea.suggestion.title);

  const toPdfRow = (idea: HistoryIdea) => ({
    date: idea.date,
    niche: idea.niche,
    analysisId: idea.analysisId,
    title: idea.suggestion.title,
    hook: idea.suggestion.hook,
    angle: idea.suggestion.angle,
    viralityScore: idea.suggestion.viralityScore ?? null,
  });

  const handleCopy = (idea: HistoryIdea) => {
    navigator.clipboard
      .writeText(
        `${idea.suggestion.title}${idea.suggestion.hook ? `\nHook: ${idea.suggestion.hook}` : ""}`
      )
      .then(() => toast.success("Título e hook copiados."))
      .catch(() => toast.error("Não foi possível copiar."));
  };

  const handleOutline = (idea: HistoryIdea) => {
    outlineMutation.mutate({ analysisId: idea.analysisId, suggestionTitle: idea.suggestion.title });
  };

  const handlePin = (idea: HistoryIdea) => {
    pinMutation.mutate({
      date: idea.date,
      analysisId: idea.analysisId,
      suggestionTitle: idea.suggestion.title,
      niche: idea.niche,
      viralityScore: idea.suggestion.viralityScore ?? null,
    });
  };

  const handleUnpin = (pinnedId: number) => {
    unpinMutation.mutate({ pinnedId });
  };

  // ===== Reordenação das ideias fixadas (arrastar e soltar) =====
  const dragIndex = useRef<number | null>(null);
  const reorderMutation = trpc.extended.reorderPinnedIdeas.useMutation({
    onMutate: async ({ orderedIds }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      const reordered = orderedIds
        .map((id) => (prev?.ideas ?? []).find((i) => i.id === id))
        .filter((p): p is PinnedIdea => Boolean(p))
        .map((p, idx) => ({ ...p, sortOrder: idx + 1 }));
      const rest = (prev?.ideas ?? []).filter((p) => !orderedIds.includes(p.id));
      utils.extended.listPinnedIdeas.setData(undefined, { ideas: [...reordered, ...rest] });
      return { prev };
    },
    onError: (_, __, ctx) => {
      utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] });
    },
    onSettled: () => utils.extended.listPinnedIdeas.invalidate(),
    onSuccess: () => toast.success("Ordem das fixadas atualizada."),
  });

  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDrop = (targetIndex: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;
    const next = [...pinned];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    reorderMutation.mutate({ orderedIds: next.map((p) => p.id) });
  };

  // ===== Anotações pessoais =====
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const noteMutation = trpc.extended.updatePinnedNote.useMutation({
    onMutate: async ({ pinnedId, notes }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, {
        ideas: (prev?.ideas ?? []).map((i) => (i.id === pinnedId ? { ...i, notes } : i)),
      });
      return { prev };
    },
    onError: (_, __, ctx) => utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] }),
    onSettled: () => utils.extended.listPinnedIdeas.invalidate(),
  });

  const handleNoteChange = useCallback((pinnedId: number, value: string) => {
    setNoteDrafts((d) => ({ ...d, [pinnedId]: value }));
  }, []);

  const commitNote = useCallback(
    (pinnedId: number, value: string) => {
      const trimmed = value.trim();
      setNoteDrafts((d) => {
        const draft = d[pinnedId] ?? "";
        if (draft.trim() === trimmed && (draft || "") === pinned.find((p) => p.id === pinnedId)?.notes) {
          return d; // sem alteração real, evita mutação
        }
        return d;
      });
      const persisted = pinned.find((p) => p.id === pinnedId)?.notes ?? null;
      if (trimmed === (persisted ?? "")) return;
      noteMutation.mutate({ pinnedId, notes: trimmed });
    },
    [pinned, noteMutation]
  );

  return (
    <SiteLayout>
      <div className="container py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Ideia do dia</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Histórico de ideias</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            O painel "Ideia do dia" rotaciona automaticamente uma sugestão do seu nicho principal a
            cada dia. Aqui você revisita as que já apareceram, fixa as que quiser manter no topo e
            exporta o histórico em PDF para planejar o calendário editorial.
          </p>
        </div>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="w-56">
            <Label htmlFor="niche-filter" className="mb-1.5 block text-xs">Nicho</Label>
            <Select value={nicheFilter} onValueChange={setNicheFilter}>
              <SelectTrigger id="niche-filter" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os nichos</SelectItem>
                {niches.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label htmlFor="score-min" className="mb-1.5 block text-xs">Score mín.</Label>
            <Input
              id="score-min"
              type="number"
              min={0}
              max={100}
              placeholder="0"
              className="h-9"
              value={scoreMin}
              onChange={(e) => setScoreMin(e.target.value)}
            />
          </div>
          <div className="w-28">
            <Label htmlFor="score-max" className="mb-1.5 block text-xs">Score máx.</Label>
            <Input
              id="score-max"
              type="number"
              min={0}
              max={100}
              placeholder="100"
              className="h-9"
              value={scoreMax}
              onChange={(e) => setScoreMax(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              setNicheFilter("all");
              setScoreMin("");
              setScoreMax("");
            }}
          >
            <Search className="mr-1.5 h-3.5 w-3.5" /> Limpar filtros
          </Button>
            <Button
            size="sm"
            className="h-9"
            disabled={exportMutation.isPending || historyQuery.isLoading}
            onClick={() => {
              const pinnedRows = pinned.map((p) => ({
                date: p.date,
                niche: p.niche,
                analysisId: p.analysisId,
                title: p.suggestionTitle,
                viralityScore: p.viralityScore,
              }));
              exportMutation.mutate({ pinned: pinnedRows, ideas: ideas.map(toPdfRow) });
            }}
          >
            {exportMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1.5 h-3.5 w-3.5" />
            )}
            Exportar PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={historyQuery.isLoading}
            onClick={() => {
              const csvPinned = pinned.map((p) => ({
                date: p.date,
                niche: p.niche,
                suggestionTitle: p.suggestionTitle,
                viralityScore: p.viralityScore,
                notes: p.notes,
              }));
              const csvIdeas = ideas.map((idea) => ({
                date: idea.date,
                niche: idea.niche,
                suggestion: idea.suggestion,
              }));
              exportIdeaHistoryCsv(csvPinned, csvIdeas);
              toast.success("CSV do histórico gerado.");
            }}
          >
            Exportar CSV
          </Button>
        </div>

        {/* Ideias fixadas */}
        {pinned.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <Pin className="h-4 w-4 text-primary" /> Fixadas no topo
            </h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Arraste os cards para reordenar. As fixadas aparecem primeiro no PDF exportado.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pinned.map((p, idx) => {
                const draft = noteDrafts[p.id] ?? (p.notes ?? "");
                return (
                <Card
                  key={p.id}
                  draggable
                  className="flex flex-col cursor-grab border-primary/40 bg-primary/5 active:cursor-grabbing"
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(idx)}
                >
                  <CardContent className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full border border-primary/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Fixada
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={unpinMutation.isPending}
                        onClick={() => handleUnpin(p.id)}
                      >
                        <PinOff className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{p.suggestionTitle}</h3>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 text-xs"
                        disabled={outlineMutation.isPending}
                        onClick={() =>
                          outlineMutation.mutate({ analysisId: p.analysisId, suggestionTitle: p.suggestionTitle })
                        }
                      >
                        <FileText className="h-3 w-3" /> Esboço
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          navigator.clipboard.writeText(p.suggestionTitle).then(() => toast.success("Título copiado."))
                        }
                      >
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs"
                        onClick={() => navigate(`/resultado/${p.analysisId}`)}
                      >
                        <Radar className="h-3 w-3" /> Análise
                      </Button>
                    </div>
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      {formatDate(new Date(p.date + "T12:00:00").getTime())} · {p.niche}
                      {p.viralityScore != null ? ` · score ${p.viralityScore}` : ""}
                    </p>
                    <div className="mt-3">
                      <Label htmlFor={`note-${p.id}`} className="mb-1 flex items-center gap-1 text-[11px] font-medium">
                        <StickyNote className="h-3 w-3" /> Anotações
                      </Label>
                      <textarea
                        id={`note-${p.id}`}
                        rows={2}
                        maxLength={2000}
                        placeholder="Rascunhos ou observações sobre essa ideia…"
                        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={draft}
                        onChange={(e) => handleNoteChange(p.id, e.target.value)}
                        onBlur={(e) => commitNote(p.id, e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          </div>
        )}

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
                {nicheFilter !== "all" || scoreMin || scoreMax
                  ? "Nenhuma ideia corresponde aos filtros atuais. Ajuste o nicho ou a faixa de score."
                  : "Ainda não há ideias no seu histórico. Conclua análises no seu nicho principal e o painel \"Ideia do dia\" começará a rotacionar sugestões diariamente."}
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                Fazer uma análise
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div>
            <h2 className="mb-3 font-display text-lg font-semibold">
              {nicheFilter !== "all" ? `Ideias · ${nicheFilter}` : "Ideias rotacionadas"}
              {(scoreMin || scoreMax) && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (score {scoreMin || 0}–{scoreMax || 100})
                </span>
              )}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ideas.map((idea) => {
                const isToday = idea.date === today;
                const pinnedFlag = isPinned(idea);
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
                        <div className="flex items-center gap-1">
                          {isToday && (
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider">
                              Hoje
                            </Badge>
                          )}
                          {pinnedFlag ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              disabled={unpinMutation.isPending}
                              onClick={() => handleUnpin(pinned.find((p) => p.date === idea.date && p.analysisId === idea.analysisId && p.suggestionTitle === idea.suggestion.title)?.id ?? 0)}
                            >
                              <Pin className="h-3.5 w-3.5 fill-primary" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={pinMutation.isPending}
                              onClick={() => handlePin(idea)}
                            >
                              <Pin className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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
                          Copiar
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
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        {formatDate(new Date(idea.date + "T12:00:00").getTime())} · {idea.niche}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <OutlineDialog outline={outline} onOpenChange={(open) => !open && setOutline(null)} />
    </SiteLayout>
  );
}
