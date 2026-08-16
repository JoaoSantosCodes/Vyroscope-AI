import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { KANBAN_HIDE_PUBLISHED_KEY, KANBAN_OLDEST_FIRST_KEY, readSessionFlag, sortColumnOldestFirst, writeSessionFlag } from "@/lib/kanbanSort";
import { quickNoteValue, shouldSaveQuickNote } from "@/lib/quickNote";
import { formatDate, scoreColor, scoreLabel } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import { Archive, ArrowUpDown, CalendarDays, Check, Clock, Edit3, FileText, Lightbulb, Loader2, Pencil, Pin, PinOff, Radar, Search, StickyNote, Target, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type OutlineData = {
  niche: string;
  analysisId: string;
  suggestion: { title: string; viralityScore: number | null; hook?: string; angle?: string; targetLength?: string };
  outline: { title: string; totalLength: string; acts: { act: string; label: string; duration: string; points: string[]; keyLine: string }[]; notes: string[] };
};

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Formata 'YYYY-MM' para exibição, ex.: 'agosto de 2026'. */
function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const idx = Number.parseInt(m, 10) - 1;
  return `${MONTHS_PT[idx] ?? m} de ${y}`;
}

/** Lista os meses visíveis no seletor: corrente + anteriores (recentes primeiro). */
function buildMonthOptions(count = 12): string[] {
  const now = new Date();
  const options: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return options;
}
const monthOptions = buildMonthOptions();

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
  status: string;
  /** Momento em que a ideia entrou no status atual */
  statusChangedAt: Date;
  /** 0 = ativa no quadro, 1 = arquivada */
  archived: number;
  createdAt: Date;
};

type SuggestionData = {
  title: string;
  hook: string;
  angle: string;
  narrativeStructure: string;
  targetLength: string;
  viralityScore: number;
  reasoning: string;
};

/** Modal da sugestão duplicada a partir de uma ideia fixada. */
function SuggestionDialog({
  suggestion,
  onOpenChange,
}: {
  suggestion: SuggestionData | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(suggestion)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sugestão pronta para gravação</DialogTitle>
        </DialogHeader>
        {suggestion && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: scoreColor(suggestion.viralityScore) + "33", color: scoreColor(suggestion.viralityScore) }}
              >
                {suggestion.viralityScore}/100
              </span>
              <span className="text-xs text-muted-foreground">Duração alvo: {suggestion.targetLength}</span>
            </div>
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Título</p>
              <p className="font-semibold leading-snug">{suggestion.title}</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hook</p>
              <p className="italic text-muted-foreground">{suggestion.hook}</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ângulo</p>
              <p className="text-muted-foreground">{suggestion.angle}</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estrutura narrativa</p>
              <p className="text-muted-foreground">{suggestion.narrativeStructure}</p>
            </div>
            {suggestion.reasoning && (
              <div>
                <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por que tende a viralizar</p>
                <p className="text-muted-foreground">{suggestion.reasoning}</p>
              </div>
            )}
            <DialogFooter>
              <Button
                size="sm"
                onClick={() => {
                  const text = `${suggestion.title}\n\nHook: ${suggestion.hook}\n\nÂngulo: ${suggestion.angle}\n\nEstrutura: ${suggestion.narrativeStructure}\n\nDuração alvo: ${suggestion.targetLength}\n\nScore de viralidade: ${suggestion.viralityScore}/100\n\n${suggestion.reasoning}`;
                  navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success("Sugestão copiada."))
                    .catch(() => toast.error("Não foi possível copiar."));
                }}
              >
                <FileText className="mr-2 h-3.5 w-3.5" /> Copiar sugestão
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const text = `${suggestion.title}\n\nHook: ${suggestion.hook}\n\nÂngulo: ${suggestion.angle}\n\nEstrutura: ${suggestion.narrativeStructure}\n\nDuração alvo: ${suggestion.targetLength}\n\nScore de viralidade: ${suggestion.viralityScore}/100\n\n${suggestion.reasoning}\n`;
                  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "sugestao-vyroscope.txt";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  toast.success("TXT da sugestão baixado.");
                }}
              >
                Exportar TXT
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
      utils.extended.listPinnedIdeas.setData(undefined, { ideas: [{ id: 0, date, analysisId, suggestionTitle, niche, viralityScore, sortOrder: null, notes: null, status: "planejada", statusChangedAt: new Date(), archived: 0, createdAt: new Date() }, ...(prev?.ideas ?? [])] });
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

  const [suggestion, setSuggestion] = useState<SuggestionData | null>(null);
  const [suggestionDialogOpen, setSuggestionDialogOpen] = useState(false);

  const duplicateMutation = trpc.extended.buildSuggestionFromPinned.useMutation({
    onSuccess: (data) => {
      setSuggestion(data);
      setSuggestionDialogOpen(true);
    },
    onError: (err) => toast.error(err.message || "Falha ao transformar a ideia em sugestão."),
  });

  const statusMutation = trpc.extended.updateIdeaStatus.useMutation({
    onMutate: async ({ pinnedId, status }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, {
        ideas: (prev?.ideas ?? []).map((i) => (i.id === pinnedId ? { ...i, status } : i)),
      });
      return { prev };
    },
    onError: (_, __, ctx) => utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] }),
    onSettled: () => utils.extended.listPinnedIdeas.invalidate(),
    onSuccess: () => toast.success("Status atualizado."),
  });

  // ===== Arquivamento (quadro limpo sem perder o histórico) =====
  const archiveMutation = trpc.extended.archiveIdea.useMutation({
    onMutate: async ({ pinnedId }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, {
        ideas: (prev?.ideas ?? []).map((i) => (i.id === pinnedId ? { ...i, archived: 1 } : i)),
      });
      return { prev };
    },
    onError: (_, __, ctx) => utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] }),
    onSettled: () => utils.extended.listPinnedIdeas.invalidate(),
    onSuccess: () => toast.success("Ideia arquivada. Ela continua no histórico."),
  });

  const unarchiveMutation = trpc.extended.unarchiveIdea.useMutation({
    onMutate: async ({ pinnedId }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, {
        ideas: (prev?.ideas ?? []).map((i) => (i.id === pinnedId ? { ...i, archived: 0 } : i)),
      });
      return { prev };
    },
    onError: (_, __, ctx) => utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] }),
    onSettled: () => utils.extended.listPinnedIdeas.invalidate(),
    onSuccess: () => toast.success("Ideia restaurada ao quadro."),
  });

  const deletePinnedMutation = trpc.extended.deletePinnedIdea.useMutation({
    onMutate: async ({ pinnedId }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      utils.extended.listPinnedIdeas.setData(undefined, {
        ideas: (prev?.ideas ?? []).filter((i) => i.id !== pinnedId),
      });
      return { prev };
    },
    onError: (_, __, ctx) => utils.extended.listPinnedIdeas.setData(undefined, ctx?.prev ?? { ideas: [] }),
    onSettled: () => utils.extended.listPinnedIdeas.invalidate(),
    onSuccess: () => toast.success("Ideia removida do histórico."),
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
  // pinned = ativas (não arquivadas); pinnedAll = todas fixadas para o PDF incluir status/notas completas
  const pinned: PinnedIdea[] = (pinnedQuery.data?.ideas ?? []).filter((p) => p.archived === 0);
  const archived: PinnedIdea[] = (pinnedQuery.data?.ideas ?? []).filter((p) => p.archived === 1);

  // ===== Edição rápida de notas no card (modal compacto) =====
  const [quickNoteId, setQuickNoteId] = useState<number | null>(null);
  const quickNoteDraft = useRef<string>("");
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);
  const openQuickNote = (pinnedId: number) => {
    quickNoteDraft.current = pinned.find((p) => p.id === pinnedId)?.notes ?? "";
    setQuickNoteId(pinnedId);
    setQuickNoteOpen(true);
    setQuickNoteSaving(false);
  };
  const saveQuickNote = () => {
    if (quickNoteId == null || noteMutation.isPending || quickNoteSaving) return;
    const persisted = pinned.find((p) => p.id === quickNoteId)?.notes ?? null;
    if (!shouldSaveQuickNote(quickNoteDraft.current, persisted)) {
      setQuickNoteOpen(false);
      return;
    }
    const value = quickNoteValue(quickNoteDraft.current);
    setQuickNoteSaving(true);
    noteMutation.mutate(
      { pinnedId: quickNoteId, notes: value ?? "" },
      {
        onSuccess: () => {
          setQuickNoteSaving(false);
          setQuickNoteOpen(false);
          toast.success("Anotação salva.");
        },
        onError: () => {
          setQuickNoteSaving(false);
          toast.error("Falha ao salvar a anotação. Tente novamente.");
        },
      }
    );
  };
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

  const handleUnarchive = (pinnedId: number) => {
    unarchiveMutation.mutate({ pinnedId });
  };

  const handleDeletePinned = (pinnedId: number) => {
    deletePinnedMutation.mutate({ pinnedId });
  };

  // ===== Reordenação das ideias fixadas (arrastar e soltar) =====
  const dragIndex = useRef<number | null>(null);
  const reorderMutation = trpc.extended.reorderPinnedIdeas.useMutation({
    onMutate: async ({ orderedIds }) => {
      await utils.extended.listPinnedIdeas.cancel();
      const prev = utils.extended.listPinnedIdeas.getData();
      const list = (prev?.ideas ?? []) as PinnedIdea[];
      const reordered = orderedIds
        .map((id) => list.find((i) => i.id === id))
        .filter((p): p is PinnedIdea => Boolean(p))
        .map((p, idx) => ({ ...p, sortOrder: idx + 1 }));
      const rest = list.filter((p) => !orderedIds.includes(p.id));
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

  // ===== Kanban: colunas por status =====
  const STATUS_LIST = [
    { key: "planejada", label: "Planejada", accent: "border-muted" },
    { key: "gravando", label: "Gravando", accent: "border-amber-500/50" },
    { key: "publicada", label: "Publicada", accent: "border-emerald-500/50" },
  ] as const;

  // ===== Ordenação das colunas pelo tempo no status atual =====
  const [oldestFirst, setOldestFirst] = useState<boolean>(() => readSessionFlag(KANBAN_OLDEST_FIRST_KEY, false));
  const toggleOldestFirst = (value: boolean) => {
    setOldestFirst(value);
    writeSessionFlag(KANBAN_OLDEST_FIRST_KEY, value);
  };

  // ===== Destaque temporário ao mover card entre colunas =====
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightRef = useRef<number | null>(null);
  const moveCard = (pinnedId: number) => {
    setHighlightedId(pinnedId);
    if (highlightRef.current) window.clearTimeout(highlightRef.current);
    highlightRef.current = window.setTimeout(() => {
      highlightRef.current = null;
      setHighlightedId((current) => (current === pinnedId ? null : current));
    }, 1500);
  };

  // ===== Filtro: ocultar publicadas (persistido na sessão via sessionStorage) =====
  const [hidePublished, setHidePublished] = useState<boolean>(() => readSessionFlag(KANBAN_HIDE_PUBLISHED_KEY, false));
  const toggleHidePublished = (value: boolean) => {
    setHidePublished(value);
    writeSessionFlag(KANBAN_HIDE_PUBLISHED_KEY, value);
  };

  // ===== Estagnação: ideias em "Gravando" por mais de 7 dias =====
  const STAGNATION_DAYS = 7;
  const now = useMemo(() => Date.now(), []);
  const isStagnant = (p: PinnedIdea) =>
    p.status === "gravando" && p.statusChangedAt && now - new Date(p.statusChangedAt).getTime() > STAGNATION_DAYS * 24 * 60 * 60 * 1000;
  const stagnantDays = (p: PinnedIdea) =>
    p.statusChangedAt ? Math.floor((now - new Date(p.statusChangedAt).getTime()) / (24 * 60 * 60 * 1000)) : 0;

  /** Quantas ideias ativas estão estagnadas em "Gravando" (>7 dias) */
  const staleIdeaCount = pinned.filter(isStagnant).length;

  // ===== Estatísticas de produção do Kanban (rodada 18) =====
  // Seletor de mês do painel (padrão: mês corrente; persiste por sessão).
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);
  const [statsMonthKey, setStatsMonthKey] = useState<string>(currentMonthKey);
  const statsInput = useMemo(() => ({ monthKey: statsMonthKey }), [statsMonthKey]);
  const statsQuery = trpc.extended.pinnedProductionStats.useQuery(statsInput, {
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
  const setGoalMutation = trpc.extended.setMonthlyGoal.useMutation({
    onSettled: () => utils.extended.pinnedProductionStats.invalidate(),
    onSuccess: () => toast.success("Meta mensal atualizada."),
    onError: (err) => toast.error(err.message || "Falha ao atualizar a meta mensal."),
  });
  const [goalDraft, setGoalDraft] = useState<string>("");
  const [editingGoal, setEditingGoal] = useState(false);
  const goalDraftRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setGoalDraft(String(statsQuery.data?.goal ?? 4));
  }, [statsQuery.data?.goal]);
  useEffect(() => {
    if (editingGoal) goalDraftRef.current?.focus();
  }, [editingGoal]);
  const commitGoal = () => {
    if (!editingGoal || setGoalMutation.isPending) return;
    const goal = Math.min(100, Math.max(1, Number.parseInt(goalDraft, 10)));
    if (Number.isNaN(goal)) {
      setGoalDraft(String(statsQuery.data?.goal ?? 4));
      setEditingGoal(false);
      return;
    }
    setGoalDraft(String(goal));
    setGoalMutation.mutate({ monthKey: statsMonthKey, goal });
    setEditingGoal(false);
  };
  const isCurrentMonthView = statsMonthKey === currentMonthKey;
  const archivePublishedMutation = trpc.extended.archivePublishedIdeas.useMutation({
    onMutate: () => {
      // Otimista: marca as publicadas ativas como arquivadas antes da resposta
      utils.extended.listPinnedIdeas.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ideas: old.ideas.map((p) =>
            p.status === "publicada" && p.archived === 0 ? { ...p, archived: 1 } : p
          ),
        };
      });
    },
    onSuccess: (data) => {
      utils.extended.pinnedProductionStats.invalidate();
      toast.success(`Arquivadas: ${data.archived} ideia${data.archived === 1 ? "" : "s"} publicada${data.archived === 1 ? "" : "s"}.`);
    },
    onError: (err) => {
      utils.extended.listPinnedIdeas.invalidate();
      toast.error(err.message || "Falha ao arquivar as publicadas.");
    },
  });
  const hasPublishedActive = pinned.some((p) => p.status === "publicada" && p.archived === 0);

  const kanbanDragIndex = useRef<number | null>(null);
  const kanbanDragStatus = useRef<"planejada" | "gravando" | "publicada" | null>(null);

  const handleKanbanDragStart = (status: "planejada" | "gravando" | "publicada", index: number) => {
    kanbanDragIndex.current = index;
    kanbanDragStatus.current = status;
  };

  const handleKanbanDrop = (status: string, targetIndex: number) => {
    const from = kanbanDragIndex.current;
    const fromStatus = kanbanDragStatus.current;
    kanbanDragIndex.current = null;
    kanbanDragStatus.current = null;
    if (from === null) return;
    if (fromStatus === status) {
      if (from === targetIndex) return;
      const column = pinned.filter((p) => p.status === status);
      const next = [...column];
      const [moved] = next.splice(from, 1);
      next.splice(targetIndex, 0, moved);
      reorderMutation.mutate({ orderedIds: next.map((p) => p.id) });
      return;
    }
    // Mover para outra coluna: atribui o novo status ao card arrastado
    const column = pinned.filter((p) => p.status === fromStatus);
    const moved = column[from];
    if (!moved) return;
    if (statusMutation.isPending) return;
    statusMutation.mutate({ pinnedId: moved.id, status: status as "planejada" | "gravando" | "publicada" });
    moveCard(moved.id);
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
              const buildPinnedRows = (rows: PinnedIdea[]) =>
                rows.map((p) => ({
                  date: p.date,
                  niche: p.niche,
                  analysisId: p.analysisId,
                  title: p.suggestionTitle,
                  viralityScore: p.viralityScore,
                  notes: p.notes ?? undefined,
                  status: (p.status === "planejada" || p.status === "gravando" || p.status === "publicada") ? (p.status as "planejada" | "gravando" | "publicada") : undefined,
                }));
              const stats = statsQuery.data;
              exportMutation.mutate({
                pinned: buildPinnedRows(pinned),
                archived: buildPinnedRows(archived),
                ideas: ideas.map(toPdfRow),
                ...(stats
                  ? {
                      productionStats: {
                        monthKey: statsMonthKey,
                        publishedThisMonth: stats.publishedThisMonth,
                        avgProductionDays: stats.avgProductionDays,
                        goal: stats.goal,
                      },
                    }
                  : {}),
              });
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
                status: p.status,
              }));
              const csvArchived = archived.map((p) => ({
                date: p.date,
                niche: p.niche,
                suggestionTitle: p.suggestionTitle,
                viralityScore: p.viralityScore,
                notes: p.notes,
                status: p.status,
              }));
              const csvIdeas = ideas.map((idea) => ({
                date: idea.date,
                niche: idea.niche,
                suggestion: idea.suggestion,
              }));
              exportIdeaHistoryCsv(csvPinned, csvIdeas, csvArchived);
              toast.success("CSV do histórico gerado (fixadas + arquivadas + histórico).");
            }}
          >
            Exportar CSV
          </Button>
        </div>

        {/* Ideias fixadas: quadro Kanban */}
        {pinned.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Pin className="h-4 w-4 text-primary" /> Fixadas no topo
              </h2>
              {/* Painel de estatísticas de produção do Kanban (rodada 19) */}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statsMonthKey} onValueChange={setStatsMonthKey}>
                  <SelectTrigger
                    className="h-7 w-auto border-border bg-card px-2 text-[11px] text-muted-foreground"
                    aria-label="Mês das estatísticas"
                  >
                    <CalendarDays className="mr-1 h-3 w-3" />
                    {formatMonthKey(statsMonthKey)}
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {formatMonthKey(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="font-medium text-foreground">
                    {statsQuery.data?.publishedThisMonth ?? 0}
                  </span>
                  publicada{statsQuery.data?.publishedThisMonth === 1 ? "" : "s"} em {formatMonthKey(statsMonthKey).toLowerCase()}
                </span>
                <span className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3 text-primary" />
                  média de <span className="font-medium text-foreground">
                    {statsQuery.data?.avgProductionDays === null
                      ? "—"
                      : `${(statsQuery.data?.avgProductionDays ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`}
                  </span> de produção
                </span>
                {hasPublishedActive && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-amber-500/40 px-2 text-[11px] text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                    disabled={archivePublishedMutation.isPending}
                    onClick={() => archivePublishedMutation.mutate()}
                  >
                    {archivePublishedMutation.isPending ? (
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    ) : (
                      <Archive className="mr-1.5 h-3 w-3" />
                    )}
                    Arquivar publicadas
                  </Button>
                )}
              </div>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Arraste os cards para reordenar dentro da coluna ou movê-los entre as colunas de status. As fixadas aparecem primeiro no PDF exportado e as arquivadas entram nas exportações em uma seção dedicada.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={hidePublished}
                  onChange={(e) => toggleHidePublished(e.target.checked)}
                />
                Ocultar publicadas
              </label>
              {hidePublished && (
                <span className="text-[11px] text-muted-foreground/70">A coluna "Publicada" fica oculta apenas nesta sessão.</span>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={oldestFirst}
                  onChange={(e) => toggleOldestFirst(e.target.checked)}
                />
                <ArrowUpDown className="h-3 w-3" /> Mais antigas no status primeiro
              </label>
              {oldestFirst && (
                <span className="text-[11px] text-muted-foreground/70">Ideias com mais tempo no status atual ficam no topo da coluna.</span>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {STATUS_LIST.map(({ key, label, accent }) => {
                if (hidePublished && key === "publicada") return null;
                let column = pinned.filter((p) => p.status === key);
                if (oldestFirst) {
                  column = sortColumnOldestFirst(column);
                }
                return (
                  <div key={key} className="flex flex-col rounded-lg border border-border bg-card/50">
                    <div className={`flex items-center justify-between border-b-2 px-3 py-2 ${accent}`}>
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                      <Badge variant="outline" className="text-[10px]">{column.length}</Badge>
                    </div>
                    <div className="space-y-3 p-3">
                      {column.map((p, idx) => {
                        const draft = noteDrafts[p.id] ?? (p.notes ?? "");
                        return (
                          <Card
                            key={p.id}
                            draggable
                            className={`flex flex-col cursor-grab border-primary/30 bg-primary/5 active:cursor-grabbing ${highlightedId === p.id ? "vy-kanban-moved" : ""}`}
                            onDragStart={() => handleKanbanDragStart(key, idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleKanbanDrop(key, idx)}
                          >
                            <CardContent className="flex flex-1 flex-col p-4">
                              <div className="flex items-start justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-medium text-muted-foreground">{idx + 1}º na coluna</span>
                                  {isStagnant(p) && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-600" title={`Esta ideia está em "Gravando" há ${stagnantDays(p)} dias`}>
                                      ⏸ Estagnada há {stagnantDays(p)}d
                                    </span>
                                  )}
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
                              <h3 className={`mt-1 font-display text-base font-semibold leading-snug ${highlightedId === p.id ? "text-amber-400" : ""}`}>{p.suggestionTitle}</h3>
                              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                                <Select
                                  value={p.status}
                                  onValueChange={(value) =>
                                    statusMutation.mutate({ pinnedId: p.id, status: value as "planejada" | "gravando" | "publicada" })
                                  }
                                  disabled={statusMutation.isPending}
                                >
                                  <SelectTrigger className="h-7 w-[120px] gap-1 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_LIST.map((s) => (
                                      <SelectItem key={s.key} value={s.key}>
                                        {s.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                                  disabled={duplicateMutation.isPending}
                                  onClick={() => duplicateMutation.mutate({ pinnedId: p.id })}
                                >
                                  {duplicateMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FileText className="h-3 w-3" />
                                  )}
                                  Duplicar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  disabled={archiveMutation.isPending}
                                  onClick={() => archiveMutation.mutate({ pinnedId: p.id })}
                                >
                                  <Archive className="h-3 w-3" /> Arquivar
                                </Button>
                              </div>
                              <p className="mt-3 text-[11px] text-muted-foreground">
                                {formatDate(new Date(p.date + "T12:00:00").getTime())} · {p.niche}
                                {p.viralityScore != null ? ` · score ${p.viralityScore}` : ""}
                              </p>
                              <div className="mt-3">
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                    <StickyNote className="h-3 w-3" /> Anotações
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                    onClick={() => openQuickNote(p.id)}
                                  >
                                    <Edit3 className="h-2.5 w-2.5" /> Editar rápida
                                  </Button>
                                </div>
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
                      {column.length === 0 && (
                        <p className="rounded-md border border-dashed border-border py-6 text-center text-[11px] text-muted-foreground/60">
                          Arraste ideias para cá
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Ideias arquivadas: fora do quadro, mas mantidas no histórico */}
        {archived.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <Archive className="h-4 w-4 text-muted-foreground" /> Arquivadas
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Ideias concluídas que saíram do quadro para mantê-lo limpo. Elas continuam disponíveis para referência e nos exports.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {archived.map((p) => (
                <Card key={p.id} className="flex flex-col border-dashed border-border bg-muted/30">
                  <CardContent className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {STATUS_LIST.find((s) => s.key === p.status)?.label ?? p.status}
                      </span>
                    </div>
                    <h3 className="mt-1 font-display text-sm font-semibold leading-snug">{p.suggestionTitle}</h3>
                    {p.notes && (
                      <p className="mt-2 line-clamp-3 text-[11px] text-muted-foreground">
                        {p.notes}
                      </p>
                    )}
                    <p className="mt-auto pt-3 text-[10px] text-muted-foreground">
                      {formatDate(new Date(p.date + "T12:00:00").getTime())} · {p.niche}
                      {p.viralityScore != null ? ` · score ${p.viralityScore}` : ""}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        disabled={unarchiveMutation.isPending}
                        onClick={() => handleUnarchive(p.id)}
                      >
                        <Archive className="h-3 w-3" /> Restaurar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs text-destructive/80 hover:text-destructive"
                        disabled={deletePinnedMutation.isPending}
                        onClick={() => handleDeletePinned(p.id)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <SuggestionDialog suggestion={suggestion} onOpenChange={setSuggestionDialogOpen} />

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

      {/* Edição rápida de notas: modal compacto sem abrir o detalhe completo */}
      <Dialog open={quickNoteOpen} onOpenChange={setQuickNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Editar anotação</DialogTitle>
          </DialogHeader>
          {quickNoteId != null && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {pinned.find((p) => p.id === quickNoteId)?.suggestionTitle}
              </p>
              <textarea
                autoFocus
                rows={4}
                maxLength={2000}
                placeholder="Rascunhos ou observações sobre essa ideia…"
                defaultValue={quickNoteDraft.current}
                onChange={(e) => {
                  quickNoteDraft.current = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveQuickNote();
                  }
                }}
                className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setQuickNoteOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={noteMutation.isPending || quickNoteSaving}
                  onClick={saveQuickNote}
                >
                  {noteMutation.isPending || quickNoteSaving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Salvar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
