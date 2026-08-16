import SiteLayout from "@/components/SiteLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { formatDate } from "@/lib/score";
import { trpc } from "@/lib/trpc";
import { Clock, Download, Loader2, Radar, RefreshCcw, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function History() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const listQuery = trpc.analysis.list.useQuery(undefined, { enabled: isAuthenticated });

  // (Rodada 35) Exportação do histórico em CSV, incluindo as retentativas
  const exportQuery = trpc.analysis.exportHistoryCsv.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  // (Rodada 35) dispara o download sempre que a query de exportação retorna dados
  useEffect(() => {
    const res = exportQuery.data;
    if (res && exportQuery.isSuccess) {
      const blob = new Blob(["\uFEFF" + res.content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = res.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Histórico exportado em CSV.");
    }
  }, [exportQuery.data, exportQuery.isSuccess]);
  useEffect(() => {
    if (exportQuery.isError) {
      toast.error(exportQuery.error.message);
    }
  }, [exportQuery.isError, exportQuery.error]);
  const handleExportCsv = () => {
    utils.analysis.exportHistoryCsv.invalidate();
    exportQuery.refetch();
  };
  const removeMutation = trpc.analysis.remove.useMutation({
    onSuccess: () => {
      toast.success("Análise removida.");
      utils.analysis.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!isAuthenticated) {
    return (
      <SiteLayout>
        <div className="container flex min-h-[50vh] max-w-3xl flex-col items-center justify-center gap-4 text-center py-16">
          <Radar className="h-10 w-10 text-muted-foreground/40" />
          <h2 className="font-display text-2xl font-semibold">Seu histórico é pessoal</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Entre com sua conta para ver suas análises anteriores — ninguém mais tem acesso a elas.
          </p>
          <Button onClick={() => startLogin()}>Entrar</Button>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container max-w-3xl py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Histórico de análises</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Todas as suas análises ficam salvas na sua conta.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={exportQuery.isFetching || !listQuery.data?.length}
            onClick={handleExportCsv}
          >
            {exportQuery.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar CSV
          </Button>
        </div>

        {listQuery.isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {!listQuery.isLoading && listQuery.data?.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Radar className="h-10 w-10 text-muted-foreground/40" />
            <h2 className="font-display text-xl font-semibold">Nenhuma análise ainda</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Comece escolhendo um nicho na página inicial e receba sugestões prontas para gravar.
            </p>
            <Button onClick={() => navigate("/")}>Iniciar primeira análise</Button>
          </div>
        )}

        {!listQuery.isLoading && !!listQuery.data?.length && (
          <div className="space-y-3">
            {listQuery.data.map((row) => (
              <Card
                key={row.id}
                className="cursor-pointer border-border/60 transition-colors hover:border-primary/40"
                onClick={() => navigate(`/resultado/${row.id}`)}
              >
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        row.status === "completed"
                          ? "bg-primary/15 text-primary"
                          : row.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Radar className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <h3 className="font-medium capitalize">{row.niche}</h3>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        row.status === "completed"
                          ? "border-primary/40 text-primary"
                          : row.status === "failed"
                            ? "border-destructive/40 text-destructive"
                            : "border-muted-foreground/30 text-muted-foreground"
                      }
                    >
                      {row.status === "completed"
                        ? "Concluída"
                        : row.status === "failed"
                          ? "Falhou"
                          : "Em execução"}
                    </Badge>
                    {row.retrySummary ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`flex cursor-default items-center gap-1 text-xs ${
                              row.retrySummary.gaveUp
                                ? "text-destructive"
                                : row.retrySummary.attempts > 1
                                  ? "text-amber-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                            {row.retrySummary.attempts}x
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="text-xs">
                            {row.retrySummary.attempts} tentativa{row.retrySummary.attempts > 1 ? "s" : ""} de coleta{" "}
                            {row.retrySummary.failures > 0
                              ? `(${row.retrySummary.failures} falha${row.retrySummary.failures > 1 ? "s" : ""})`
                              : "sem falhas"}
                            {row.retrySummary.gaveUp
                              ? " — desistiu após as retentativas"
                              : row.retrySummary.attempts > 1
                                ? " — concluiu com retentativas"
                                : ""}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMutation.mutate({ id: row.id });
                      }}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remover análise"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
