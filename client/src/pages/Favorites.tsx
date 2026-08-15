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
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import {
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

        {/* Barra de pastas */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFolderFilter(null)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              folderFilter === null
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            Todas ({items.length})
          </button>
          {folders.map((f) => (
            <div key={f.id} className="group relative">
              <button
                type="button"
                onClick={() => setFolderFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  folderFilter === f.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: f.color ?? "#f59e0b" }} />
                {f.name} ({countInFolder(f.id)})
              </button>
              <div className="absolute -top-0.5 right-0 hidden translate-y-1/2 group-hover:flex">
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
                <Card key={t.id} className="group overflow-hidden border-border/60 transition-colors hover:border-primary/30">
                  <CardContent className="p-0">
                    <div className="relative aspect-video overflow-hidden bg-background/60">
                      <img
                        src={t.imageUrl}
                        alt={t.suggestionTitle}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
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

