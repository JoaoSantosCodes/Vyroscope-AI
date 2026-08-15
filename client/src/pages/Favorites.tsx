import SiteLayout from "@/components/SiteLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { exportFavoritesPdf } from "@/lib/export";
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
  CheckSquare,
  EllipsisVertical,
  FolderOpen,
  FolderPlus,
  Heart,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Radar,
  Trash2,
  Download,
  FileDown,
  Square,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const FOLDER_COLORS = ["#f59e0b", "#ef4444", "#8b5cf6", "#10b981", "#3b82f6", "#ec4899", "#f97316", "#06b6d4"];

type FavoriteRow = {
  analyses: { id: string; niche: string };
  suggestion_thumbnails: {
    id: number;
    analysisId: string;
    suggestionTitle: string;
    imageUrl: string;
    prompt: string;
    favorite: number;
    folderId: number | null;
    sortOrder: number | null;
    createdAt: Date;
  };
};

export default function Favorites() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const favoritesQuery = trpc.extended.listFavorites.useQuery();
  const foldersQuery = trpc.extended.listFolders.useQuery();

  const [folderFilter, setFolderFilter] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ thumbnailId: number; currentName: string; currentFolderId: number | null } | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropOverFolder, setDropOverFolder] = useState<number | null>(null);
  const [dropOverThumbnail, setDropOverThumbnail] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<"move" | "reorder">("move");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);

  const hasSelection = selectedIds.size > 0;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const ids = new Set(filtered.map((r) => r.suggestion_thumbnails.id));
    setSelectedIds((prev) => (prev.size === ids.size ? new Set() : ids));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchMove = (folderId: number | null) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSelectedIds(new Set());
    let done = 0;
    ids.forEach((id) => {
      moveMutation.mutate({ thumbnailId: id, folderId });
      done += 1;
    });
    toast.success(`(${ids.length}) ${folderId === null ? "movidas para a galeria." : `movidas para "${folderName(folderId)}".`}`);
  };

  const handleBatchUnfavorite = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setSelectedIds(new Set());
    ids.forEach((id) => toggleMutation.mutate({ thumbnailId: id, favorite: false }));
    toast.success(`(${ids.length}) removidas dos favoritos.`);
  };

  const handleExportPdf = async () => {
    if (items.length === 0) return;
    setExportingPdf(true);
    try {
      const rows = buildExportRows();
      await exportFavoritesPdf(rows);
      toast.success("PDF dos favoritos exportado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar o PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  const buildExportRows = () => {
    // Uma seção por pasta (inclui raiz), thumbnails na ordem do sortOrder
    const rootThumbs = items.filter((r) => r.suggestion_thumbnails.folderId === null);
    const rows: { folder: { id: number | null; name: string | null; color: string | null }; thumbnails: { id: number; imageUrl: string; suggestionTitle: string; niche: string; sortOrder: number | null; createdAt: Date }[] }[] = [];
    if (rootThumbs.length > 0) {
      rows.push({ folder: { id: null, name: null, color: null }, thumbnails: rootThumbs.map(mapThumb) });
    }
    folders.forEach((f) => {
      const thumbs = items.filter((r) => r.suggestion_thumbnails.folderId === f.id);
      if (thumbs.length > 0) {
        rows.push({ folder: { id: f.id, name: f.name, color: f.color }, thumbnails: thumbs.map(mapThumb) });
      }
    });
    return rows;
  };

  const mapThumb = (row: FavoriteRow) => {
    const t = row.suggestion_thumbnails;
    return {
      id: t.id,
      imageUrl: t.imageUrl,
      suggestionTitle: t.suggestionTitle,
      niche: row.analyses.niche,
      sortOrder: t.sortOrder ?? null,
      createdAt: t.createdAt,
    };
  };

  const handleDragStart = (e: React.DragEvent, thumbnailId: number) => {
    setDraggedId(thumbnailId);
    e.dataTransfer.setData("text/plain", String(thumbnailId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropOverFolder(null);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    setDropOverFolder(null);
    setDropOverThumbnail(null);
    const raw = e.dataTransfer.getData("text/plain");
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    if (dragMode === "reorder") return; // reordenação é tratada no drop do card
    moveMutation.mutate({ thumbnailId: id, folderId: targetFolderId });
    const destName = folderName(targetFolderId);
    toast.success(destName ? `Movida para "${destName}".` : "Movida para a galeria.");
  };

  const handleReorderDrop = (e: React.DragEvent, targetThumbnailId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropOverThumbnail(null);
    const raw = e.dataTransfer.getData("text/plain");
    const dragged = Number(raw);
    if (!Number.isFinite(dragged) || dragged === targetThumbnailId) return;
    const current = targetRow(targetThumbnailId)?.suggestion_thumbnails.folderId ?? null;
    if (targetRow(dragged)?.suggestion_thumbnails.folderId !== current) return; // só reordena na mesma pasta
    // Reordena: dragging vai para a posição do target dentro da lista filtrada
    const ids = filtered.map((row) => row.suggestion_thumbnails.id);
    const fromIdx = ids.indexOf(dragged);
    const toIdx = ids.indexOf(targetThumbnailId);
    if (fromIdx === -1 || toIdx === -1) return;
    const moved = ids.splice(fromIdx, 1)[0];
    ids.splice(toIdx, 0, moved);
    reorderMutation.mutate({ folderId: current, orderedIds: ids });
    toast.success("Ordem atualizada.");
  };

  const targetRow = (thumbnailId: number) => items.find((r) => r.suggestion_thumbnails.id === thumbnailId) ?? null;

  const reorderMutation = trpc.extended.reorderThumbnails.useMutation({
    onMutate: async ({ orderedIds }) => {
      await utils.extended.listFavorites.cancel();
      const previous = utils.extended.listFavorites.getData();
      // Reaplica a ordem manualmente no cache (itens com sortOrder menor primeiro)
      utils.extended.listFavorites.setData(undefined, (old) => {
        if (!old) return old;
        const rank = new Map<number, number>();
        orderedIds.forEach((id, i) => rank.set(id, i + 1));
        const sorted = [...old].sort((a, b) => {
          const ra = rank.get(a.suggestion_thumbnails.id);
          const rb = rank.get(b.suggestion_thumbnails.id);
          if (ra !== undefined && rb !== undefined) return ra - rb;
          if (ra !== undefined) return -1;
          if (rb !== undefined) return 1;
          return 0;
        });
        return sorted;
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) {
        utils.extended.listFavorites.setData(undefined, context.previous);
      }
      toast.error(err.message);
    },
    onSettled: () => utils.extended.listFavorites.invalidate(),
  });

  const toggleMutation = trpc.extended.toggleFavorite.useMutation({
    onMutate: async ({ thumbnailId, favorite }) => {
      await utils.extended.listFavorites.cancel();
      const previous = utils.extended.listFavorites.getData();
      utils.extended.listFavorites.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.suggestion_thumbnails.id === thumbnailId
            ? { ...row, suggestion_thumbnails: { ...row.suggestion_thumbnails, favorite: favorite ? 1 : 0 } }
            : row
        );
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) {
        utils.extended.listFavorites.setData(undefined, context.previous);
      }
      toast.error(err.message);
    },
    onSettled: () => utils.extended.listFavorites.invalidate(),
  });

  const createFolderMutation = trpc.extended.createFolder.useMutation({
    onSuccess: () => {
      toast.success("Pasta criada.");
      utils.extended.listFolders.invalidate();
      setCreateOpen(false);
      setNewFolderName("");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateFolderMutation = trpc.extended.updateFolder.useMutation({
    onSuccess: () => {
      toast.success("Pasta atualizada.");
      utils.extended.listFolders.invalidate();
      setRenameTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteFolderMutation = trpc.extended.deleteFolder.useMutation({
    onSuccess: () => {
      toast.success("Pasta excluída. As thumbnails voltaram para a galeria.");
      utils.extended.listFolders.invalidate();
      utils.extended.listFavorites.invalidate();
      setFolderFilter(null);
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const moveMutation = trpc.extended.moveThumbnail.useMutation({
    onMutate: async ({ thumbnailId, folderId }) => {
      await utils.extended.listFavorites.cancel();
      const previous = utils.extended.listFavorites.getData();
      utils.extended.listFavorites.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.suggestion_thumbnails.id === thumbnailId
            ? { ...row, suggestion_thumbnails: { ...row.suggestion_thumbnails, folderId } }
            : row
        );
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous !== undefined) {
        utils.extended.listFavorites.setData(undefined, context.previous);
      }
      toast.error(err.message);
    },
    onSettled: () => {
      utils.extended.listFavorites.invalidate();
      utils.extended.listFolders.invalidate();
    },
  });

  const handleToggle = (thumbnailId: number, currentlyFavorite: boolean) => {
    toggleMutation.mutate({ thumbnailId, favorite: !currentlyFavorite });
    toast.success(!currentlyFavorite ? "Thumbnail adicionada aos favoritos." : "Thumbnail removida dos favoritos.");
  };

  const handleDownload = (imageUrl: string, suggestionTitle: string) => {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `vyroscope-favorita-${slugifyText(suggestionTitle)}.png`;
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

  const items = (favoritesQuery.data ?? []) as FavoriteRow[];
  const folders = foldersQuery.data ?? [];

  const filtered = folderFilter === null ? items : items.filter((row) => row.suggestion_thumbnails.folderId === folderFilter);
  const folderName = (id: number | null) => folders.find((f) => f.id === id)?.name ?? null;
  const folderColor = (id: number | null) => folders.find((f) => f.id === id)?.color ?? null;
  const countInFolder = (id: number | null) => items.filter((r) => r.suggestion_thumbnails.folderId === id).length;

  return (
    <SiteLayout>
      <div className="container max-w-6xl py-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Galeria</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Favoritos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Suas thumbnails geradas pela IA salvas como referência para projetos futuros. Clique no
            coração em qualquer thumbnail do resultado da análise para adicioná-la aqui.
          </p>
        </div>

        {/* Ações da galeria */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportPdf}
            disabled={items.length === 0 || exportingPdf}
          >
            {exportingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            Exportar PDF
          </Button>
          <Button
            variant={hasSelection ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={selectAllFiltered}
            disabled={items.length === 0}
          >
            {hasSelection ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
            {hasSelection ? "Limpar seleção" : "Selecionar"}
            {hasSelection && <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">{selectedIds.size}</span>}
          </Button>
        </div>

        {/* Barra de ações em lote */}
        {hasSelection && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <span className="text-xs font-medium text-primary">{selectedIds.size} selecionada{selectedIds.size === 1 ? "" : "s"}</span>
            <div className="h-4 w-px bg-border" />
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => handleBatchMove(null)}>
              <ImageIcon className="h-3.5 w-3.5" /> Mover para galeria
            </Button>
            {folders.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <FolderOpen className="h-3.5 w-3.5" /> Mover para pasta
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={() => handleBatchMove(f.id)}
                      className="text-xs"
                    >
                      <span className="mr-2 h-2 w-2 rounded-full" style={{ background: f.color ?? "#f59e0b" }} />
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
              onClick={handleBatchUnfavorite}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover dos favoritos
            </Button>
          </div>
        )}

        {/* Barra de pastas */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFolderFilter(null)}
            onDragOver={(e) => {
              if (draggedId !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(e) => handleDrop(e, null)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              folderFilter === null
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            } ${draggedId !== null ? "border-primary/60 bg-primary/10" : ""}`}
          >
            <Heart className="h-3.5 w-3.5" />
            Todas ({items.length})
          </button>
          {folders.map((f) => (
            <div key={f.id} className="group relative">
              <button
                type="button"
                onClick={() => setFolderFilter(f.id)}
                onDragOver={(e) => {
                  if (draggedId !== null) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropOverFolder(f.id);
                  }
                }}
                onDragLeave={() => setDropOverFolder((prev) => (prev === f.id ? null : prev))}
                onDrop={(e) => handleDrop(e, f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  dropOverFolder === f.id
                    ? "border-primary bg-primary/25 text-primary ring-2 ring-primary/40"
                    : folderFilter === f.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: f.color ?? "#f59e0b" }} />
                {f.name} ({countInFolder(f.id)})
              </button>
              <div className={`absolute -top-0.5 right-0 hidden translate-y-1/2 group-hover:flex ${dropOverFolder === f.id ? "!flex" : ""}`}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-full border border-border bg-card p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
                      aria-label="Opções da pasta"
                    >
                      <EllipsisVertical className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRenameTarget({ id: f.id, name: f.name })}>
                      <Pencil className="mr-2 h-4 w-4" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget({ id: f.id, name: f.name })}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Nova pasta
          </button>
        </div>

        {favoritesQuery.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            {folderFilter !== null ? (
              <>
                <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
                <h2 className="font-display text-xl font-semibold">Pasta vazia</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  Esta pasta ainda não tem thumbnails. Use o menu de três pontos em uma thumbnail da
                  galeria para movê-la para cá.
                </p>
                <Button variant="outline" onClick={() => setFolderFilter(null)}>
                  Ver todas as favoritas
                </Button>
              </>
            ) : (
              <>
                <Heart className="h-10 w-10 text-muted-foreground/40" />
                <h2 className="font-display text-xl font-semibold">Nenhuma thumbnail favorita ainda</h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  Gere thumbnails nas suas análises e clique no coração para salvá-las aqui como
                  referência.
                </p>
                <Button variant="outline" onClick={() => navigate("/historico")}>
                  Ver histórico de análises
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((row) => {
              const t = row.suggestion_thumbnails;
              const folder = folderName(t.folderId);
              const color = folderColor(t.folderId);
              return (
                <Card
                  key={t.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, t.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => {
                    if (draggedId !== null && draggedId !== t.id && row.suggestion_thumbnails.folderId === (targetRow(draggedId)?.suggestion_thumbnails.folderId ?? undefined)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropOverThumbnail(t.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    // Só limpa se realmente saiu do card
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDropOverThumbnail((prev) => (prev === t.id ? null : prev));
                    }
                  }}
                  onDrop={(e) => handleReorderDrop(e, t.id)}
                  className={`group cursor-grab overflow-hidden border-border/60 transition-all hover:border-primary/30 active:cursor-grabbing ${
                    draggedId === t.id
                      ? "scale-[0.97] opacity-50"
                      : dropOverThumbnail === t.id
                        ? "border-primary ring-2 ring-primary/40 scale-[0.98]"
                        : ""
                  }`}
                  title="Arraste e solte em uma pasta acima para movê-la, ou sobre outra thumbnail da mesma pasta para reordenar"
                >
                  <CardContent className="p-0">
                    <div className="relative aspect-video overflow-hidden bg-background/60">
                      <img
                        src={t.imageUrl}
                        alt={t.suggestionTitle}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                      {/* Checkbox de seleção em lote */}
                      <button
                        type="button"
                        aria-label={selectedIds.has(t.id) ? "Desmarcar seleção" : "Selecionar thumbnail"}
                        className="absolute left-3 top-3 z-10 rounded-full bg-black/60 p-1 text-white backdrop-blur-sm transition-transform active:scale-90 hover:text-primary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSelect(t.id);
                        }}
                      >
                        {selectedIds.has(t.id) ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                      </button>
                      {/* Indicador numérico da ordem manual */}
                      {t.sortOrder !== null && (
                        <span className="absolute right-3 top-3 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                          {t.sortOrder}
                        </span>
                      )}
                      <span className="absolute inset-x-3 top-3 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                            favorita
                          </span>
                          {folder && (
                            <span
                              className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
                              title={`Pasta: ${folder}`}
                            >
                              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color ?? "#f59e0b" }} />
                              {folder}
                            </span>
                          )}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label="Opções da thumbnail"
                              className="rounded-full bg-black/60 p-1.5 text-white/90 backdrop-blur-sm transition-transform active:scale-90 hover:text-primary"
                            >
                              <EllipsisVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Mover para pasta
                            </DropdownMenuLabel>
                            {folders.length === 0 ? (
                              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                Nenhuma pasta ainda — crie uma acima
                              </DropdownMenuItem>
                            ) : (
                              folders.map((f) => (
                                <DropdownMenuItem
                                  key={f.id}
                                  onClick={() => {
                                    moveMutation.mutate({ thumbnailId: t.id, folderId: f.id });
                                    toast.success(`Movida para "${f.name}".`);
                                  }}
                                  disabled={t.folderId === f.id}
                                >
                                  <span className="mr-2 h-2 w-2 rounded-full" style={{ background: f.color ?? "#f59e0b" }} />
                                  {f.name}
                                </DropdownMenuItem>
                              ))
                            )}
                            {t.folderId !== null && (
                              <DropdownMenuItem
                                onClick={() => {
                                  moveMutation.mutate({ thumbnailId: t.id, folderId: null });
                                  toast.success("Movida para a galeria.");
                                }}
                              >
                                <ImageIcon className="mr-2 h-4 w-4" /> Remover da pasta
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDownload(t.imageUrl, t.suggestionTitle)}>
                              <Download className="mr-2 h-4 w-4" /> Baixar PNG
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleToggle(t.id, true)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Remover dos favoritos
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="line-clamp-2 text-sm font-medium leading-snug">{t.suggestionTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(t.createdAt.valueOf())} · {row.analyses.niche}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <a
                          href={t.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Abrir original <Radar className="h-3 w-3" />
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => handleDownload(t.imageUrl, t.suggestionTitle)}
                        >
                          <Download className="h-3.5 w-3.5" /> Baixar PNG
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Diálogo de nova pasta */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova pasta</DialogTitle>
            <DialogDescription>
              Organize suas thumbnails por projeto ou canal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Ex: Canal principal, Shorts, Campanha X"
                maxLength={120}
                onKeyDown={(e) => e.key === "Enter" && createFolderMutation.mutate({ name: newFolderName.trim(), color: newFolderColor })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Cor do rótulo</label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewFolderColor(c)}
                    aria-label={`Cor ${c}`}
                    className={`h-6 w-6 rounded-full transition-transform ${newFolderColor === c ? "scale-110 ring-2 ring-offset-2 ring-offset-background" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              onClick={() => createFolderMutation.mutate({ name: newFolderName.trim(), color: newFolderColor })}
            >
              {createFolderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Criar pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de renomear pasta */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear pasta</DialogTitle>
          </DialogHeader>
          <RenameFolderForm
            initialName={renameTarget?.name ?? ""}
            isPending={updateFolderMutation.isPending}
            onSubmit={(name) => {
              if (renameTarget) updateFolderMutation.mutate({ folderId: renameTarget.id, name: name.trim() });
            }}
            onCancel={() => setRenameTarget(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão de pasta */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pasta “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              As thumbnails salvas na pasta não serão excluídas — elas voltam para a galeria geral
              de favoritos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteFolderMutation.mutate({ folderId: deleteTarget.id });
              }}
            >
              Excluir pasta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de mover thumbnail */}
      <Dialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover thumbnail</DialogTitle>
            <DialogDescription>
              Escolha a pasta para “{moveTarget?.currentName}”.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (moveTarget) {
                  moveMutation.mutate({ thumbnailId: moveTarget.thumbnailId, folderId: null });
                  toast.success("Movida para a galeria.");
                  setMoveTarget(null);
                }
              }}
            >
              <ImageIcon className="mr-2 h-4 w-4" /> Galeria geral (sem pasta)
            </Button>
            {folders.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                disabled={f.id === moveTarget?.currentFolderId}
                onClick={() => {
                  if (moveTarget) {
                    moveMutation.mutate({ thumbnailId: moveTarget.thumbnailId, folderId: f.id });
                    toast.success(`Movida para "${f.name}".`);
                    setMoveTarget(null);
                  }
                }}
              >
                <span className="mr-2 h-2 w-2 rounded-full" style={{ background: f.color ?? "#f59e0b" }} />
                {f.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}

function RenameFolderForm({
  initialName,
  isPending,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  isPending: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Nome</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          onKeyDown={(e) => e.key === "Enter" && onSubmit(name)}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={!name.trim() || isPending} onClick={() => onSubmit(name)}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </DialogFooter>
    </>
  );
}

