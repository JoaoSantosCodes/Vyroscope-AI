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

import type { ContentAgenda } from "@vyroscope-ai-server/extended";

/**
 * Exporta a agenda do mês como PDF. Delega a geração ao servidor
 * (pdfkit, rota /api/export-agenda-pdf); o download é disparado no navegador.
 */
export async function exportAgendaPdf(agenda: ContentAgenda) {
  const response = await fetch("/api/export-agenda-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ agenda }),
  });
  if (!response.ok) {
    throw new Error(`PDF generation failed: ${response.status}`);
  }
  const blob = await response.blob();
  downloadBlob(blob, `vyroscope-agenda-${slugify(agenda.niche)}.pdf`);
}

/**
 * Exporta a galeria de favoritos (organizada por pastas) como PDF.
 * Delega a geração ao servidor (rota /api/export-favorites-pdf); o download
 * é disparado no navegador.
 */
export async function exportFavoritesPdf(rows: { folder: { id: number | null; name: string | null }; thumbnails: { id: number; imageUrl: string; suggestionTitle: string; niche: string; sortOrder: number | null; createdAt: Date }[] }[]) {
  const response = await fetch("/api/export-favorites-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ rows }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "unknown" }));
    throw new Error(typeof err?.error === "string" ? err.error : `PDF generation failed: ${response.status}`);
  }
  const blob = await response.blob();
  downloadBlob(blob, "vyroscope-favoritos.pdf");
}

/**
 * Exporta a galeria de favoritos (organizada por pastas) como CSV, com
 * download imediato no navegador. Colunas: pasta, ordem, título sugerido,
 * nicho, data, URL da imagem.
 */
export function exportFavoritesCsv(
  rows: { folder: { id: number | null; name: string | null }; thumbnails: { id: number; imageUrl: string; suggestionTitle: string; niche: string; sortOrder: number | null; createdAt: Date }[] }[]
) {
  const blob = new Blob(["\uFEFF" + buildFavoritesCsv(rows).join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, "vyroscope-favoritos.csv");
}

/**
 * Monta as linhas do CSV da galeria de favoritos (organizada por pastas).
 * Função pura para permitir testes unitários no Vitest.
 */
export function buildFavoritesCsv(
  rows: { folder: { id: number | null; name: string | null }; thumbnails: { id: number; imageUrl: string; suggestionTitle: string; niche: string; sortOrder: number | null; createdAt: Date }[] }[]
): string[] {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csvRows: string[] = ["Pasta,Ordem,Título sugerido,Nicho,Data adicionada,URL da imagem"];
  for (const row of rows) {
    const folderName = row.folder.name ?? "Galeria (sem pasta)";
    for (const t of row.thumbnails) {
      csvRows.push(
        [esc(folderName), esc(t.sortOrder), esc(t.suggestionTitle), esc(t.niche), esc(new Date(t.createdAt).toLocaleDateString("pt-BR")), esc(t.imageUrl)].join(",")
      );
    }
  }
  return csvRows;
}
