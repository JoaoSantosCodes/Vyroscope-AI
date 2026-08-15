import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExtendedScript } from "@vyroscope-ai-server/extended";
import type { Suggestion } from "@vyroscope-ai-server/analysis";
import { Copy, Loader2, Monitor, ScrollText, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Modal que exibe o roteiro estendido gerado a partir de uma sugestão, com
 * abas internas (roteiro completo, seções com visuais, notas) e exportação.
 */
export default function ScriptDialog({
  suggestion,
  script,
  open,
  onOpenChange,
}: {
  suggestion: Suggestion;
  script: ExtendedScript;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<"full" | "sections" | "notes">("full");
  const [copied, setCopied] = useState(false);

  const copyScript = async () => {
    const lines: string[] = [
      `ROTEIRO: ${suggestion.title}`,
      `DURAÇÃO ALVO: ${suggestion.targetLength}`,
      "",
      script.fullScript,
      "",
      ...script.sections.map(
        (s) => `[${s.heading}] VISUAIS: ${s.visuals} — FALA: ${s.dialogue}`
      ),
      "",
      "NOTAS DE PRODUÇÃO:",
      ...script.notes.map((n) => `• ${n}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("Roteiro copiado para a área de transferência");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const downloadTxt = () => {
    const lines: string[] = [
      `ROTEIRO: ${suggestion.title}`,
      `DURAÇÃO ALVO: ${suggestion.targetLength}`,
      "",
      script.fullScript,
      "",
      ...script.sections.map((s) => `[${s.heading}] VISUAIS: ${s.visuals}\nFALA: ${s.dialogue}`),
      "",
      "NOTAS DE PRODUÇÃO:",
      ...script.notes.map((n) => `• ${n}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vyroscope-roteiro-${slugify(suggestion.title)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Arquivo TXT baixado.");
  };

  const tabs = [
    { value: "full" as const, label: "Roteiro completo", icon: ScrollText },
    { value: "sections" as const, label: "Seções e visuais", icon: Video },
    { value: "notes" as const, label: "Notas de produção", icon: Monitor },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[min(92vw,56rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-snug">{suggestion.title}</DialogTitle>
          <DialogDescription>
            Roteiro estendido pronto para gravar · duração alvo {script.totalLength}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <Button
                  key={t.value}
                  variant={tab === t.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setTab(t.value)}
                >
                  <Icon className="mr-1.5 h-3.5 w-3.5" />
                  {t.label}
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyScript}>
              {copied ? "Copiado" : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar</>}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTxt}>
              Baixar TXT
            </Button>
          </div>
        </div>

        {tab === "full" && (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {script.fullScript}
          </div>
        )}

        {tab === "sections" && (
          <div className="space-y-4">
            {script.sections.map((s, i) => (
              <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{s.heading}</h3>
                  <span className="text-xs text-primary">{s.timing}</span>
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  O que aparece na tela
                </p>
                <p className="text-sm text-muted-foreground">{s.visuals}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fala
                </p>
                <p className="text-sm italic leading-relaxed">“{s.dialogue}”</p>
              </div>
            ))}
          </div>
        )}

        {tab === "notes" && (
          <ul className="space-y-2">
            {script.notes.map((n, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-accent text-center text-xs leading-5 text-accent-foreground">
                  {i + 1}
                </span>
                {n}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
