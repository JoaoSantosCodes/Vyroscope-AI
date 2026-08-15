import type { AnalysisResult } from "@vyroscope-ai-server/analysis";

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
 * Exporta a análise como CSV (sugestões + vídeos + padrões), com download
 * imediato no navegador. Sem dependências externas.
 */
export function exportAnalysisCsv(result: AnalysisResult, niche: string) {
  const csvRows: string[] = [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };

  csvRows.push("Nicho,Data da análise,Visualizações,Virality Score,Tipo");

  for (const s of result.suggestions ?? []) {
    csvRows.push([
      esc(niche),
      esc(result.analyzedAt),
      esc(s.title),
      esc(s.hook),
      esc(s.angle),
      esc(s.narrativeStructure),
      esc(s.targetLength),
      esc(s.viralityScore),
      esc(s.reasoning),
      esc("sugestao"),
    ].join(","));
  }

  for (const p of result.patterns ?? []) {
    csvRows.push([
      esc(niche),
      esc(result.analyzedAt),
      esc(p.pattern),
      esc(p.explanation),
      esc(p.evidenceVideoCount),
      esc(p.score),
      esc("padrao"),
    ].join(","));
  }

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `vyroscope-${slugify(niche)}-sugestoes.csv`);
}

/**
 * Exporta a análise como PDF. Delega a geração ao servidor (pdfkit) que
 * devolve o arquivo binário via tRPC; o download é disparado no navegador.
 */
export async function exportAnalysisPdf(result: AnalysisResult, niche: string) {
  const response = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ result, niche }),
  });
  if (!response.ok) {
    throw new Error(`PDF generation failed: ${response.status}`);
  }
  const blob = await response.blob();
  downloadBlob(blob, `vyroscope-${slugify(niche)}-sugestoes.pdf`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
