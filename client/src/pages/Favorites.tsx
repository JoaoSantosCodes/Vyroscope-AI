import SiteLayout from "@/components/SiteLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import { Heart, Loader2, Radar, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Favorites() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const favoritesQuery = trpc.extended.listFavorites.useQuery();

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

  const items = favoritesQuery.data ?? [];

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

        {favoritesQuery.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <Heart className="h-10 w-10 text-muted-foreground/40" />
            <h2 className="font-display text-xl font-semibold">Nenhuma thumbnail favorita ainda</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Gere thumbnails nas suas análises e clique no coração para salvá-las aqui como
              referência.
            </p>
            <Button variant="outline" onClick={() => navigate("/historico")}>
              Ver histórico de análises
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((row) => {
            const t = row.suggestion_thumbnails;
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
                      <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                        favorita
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggle(t.id, true)}
                        disabled={toggleMutation.isPending}
                        aria-label="Remover dos favoritos"
                        className="rounded-full bg-black/60 p-1.5 text-white/90 backdrop-blur-sm transition-transform active:scale-90 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">{t.suggestionTitle}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(t.createdAt.valueOf())}</p>
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
    </SiteLayout>
  );
}
