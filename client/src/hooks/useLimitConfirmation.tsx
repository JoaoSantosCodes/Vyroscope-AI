import { trpc } from "@/lib/trpc";
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
import { useState } from "react";
import { toast } from "sonner";

const LIMIT_BLOCK_PHRASES = ["Limite", "limite"];

/** Retorna true quando a mensagem do erro tRPC indica bloqueio/aviso pelos limites diários. */
function isLimitError(message: string | undefined): boolean {
  if (!message) return false;
  return LIMIT_BLOCK_PHRASES.some((p) => message.includes(p));
}

/**
 * (Rodada 37/38) Hook que captura o erro `PRECONDITION_FAILED` emitido pelo
 * `analysis.run`/`analysis.retry` quando o consumo diário atinge 100% no modo
 * "Apenas avisar". Exibe um dialog de confirmação; ao confirmar, chama
 * `confirmLimitOverride` — que libera APENAS A PRÓXIMA análise (uso único,
 * conforme Rodada 38) — e dispara o callback de reexecução.
 */
export function useLimitConfirmation({
  onConfirm,
  /** Mensagem de erro exibida no dialog (opcional — usa a do erro) */
  message,
}: {
  onConfirm: () => void;
  message?: string | null;
}) {
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<string | null>(message ?? null);

  const overrideMutation = trpc.profile.confirmLimitOverride.useMutation({
    onSuccess: ({ overrideRemaining }) => {
      setPending(null);
      toast.success(
        overrideRemaining === 1
          ? "Confirmado: a próxima análise será executada normalmente."
          : `Confirmado: ${overrideRemaining} análise(s) autorizada(s) hoje.`
      );
      void utils.profile.getLimits.invalidate();
      void utils.profile.listUsageAlerts.invalidate();
      onConfirm();
    },
    onError: (err) => {
      toast.error(err.message || "Não foi possível registrar a liberação.");
      setPending(null);
    },
  });

  /** Chame no onError do mutation da análise. */
  const handleLimitError = (err: { message?: string }) => {
    if (isLimitError(err.message)) {
      setPending(err.message ?? null);
      return true;
    }
    return false;
  };

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Limite diário atingido — deseja continuar?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {pending
              ? `Sua análise foi interrompida pela proteção de custos: ${pending}`
              : "Uma análise foi interrompida pela proteção de custos."}{" "}
            Você pode confirmar e prosseguir — a liberação vale apenas para a
            próxima análise (uso único). Considere revisar seus limites em{" "}
            <span className="font-medium">Limites e proteção de custos</span> no perfil.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => overrideMutation.mutate()}
            disabled={overrideMutation.isPending}
          >
            {overrideMutation.isPending ? "Confirmando…" : "Sim, executar esta análise"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { handleLimitError, dialog };
}
