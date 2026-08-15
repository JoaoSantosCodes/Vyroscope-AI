import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { scoreColor } from "@/lib/score";
import type { AlternativeTitlesResult } from "@vyroscope-ai-server/extended";
import { Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AlternativeTitlesDialog({
  titles,
  originalTitle,
  open,
  onOpenChange,
}: {
  titles: NonNullable<AlternativeTitlesResult>["titles"];
  originalTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState<number | null>(null);

  const sorted = [...titles].sort((a, b) => b.viralityScore - a.viralityScore);

  const copyTitle = async (title: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(title);
      setCopied(idx);
      toast.success("Título copiado para a área de transferência");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Títulos alternativos
          </DialogTitle>
          <DialogDescription>
            Cinco variações do título “{originalTitle}”, cada uma com score de
            viralidade previsto pela IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {sorted.map((t, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border/60 bg-background/60 p-3.5 transition-colors hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold leading-snug">{t.title}</h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${scoreColor(t.viralityScore)} border-current/25 bg-accent/50`}
                >
                  {t.viralityScore}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t.rationale}</p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => copyTitle(t.title, idx)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied === idx ? "Copiado" : "Copiar"}
                </Button>
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                  {idx === 0 && sorted.length > 1 ? "maior score" : "variação"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
