import PDFDocument from "pdfkit";
import type { AnalysisResult } from "./analysis";

export type FavoritesExportRow = {
  folder: { id: number | null; name: string | null; color: string | null };
  thumbnails: {
    id: number;
    imageUrl: string;
    suggestionTitle: string;
    niche: string;
    sortOrder: number | null;
    createdAt: Date;
  }[];
};

const COLORS = {
  dark: "#0C0C10",
  amber: "#E8A33D",
  gray: "#8A8A95",
  light: "#E9E9EE",
  cardBg: "#16161D",
};

const scoreColor = (score: number): string => {
  if (score >= 80) return "#4C9F70";
  if (score >= 60) return "#E8A33D";
  return "#C75454";
};

/**
 * Gera um PDF elegante com as sugestões de vídeo da análise.
 */
export async function buildAnalysisPdf(result: AnalysisResult, niche: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ===== Capa =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(11).text("VYROSCOPE AI", 54, 72, { characterSpacing: 4 });
      doc.moveTo(54, 96).lineTo(150, 96).strokeColor(COLORS.amber).lineWidth(1.5).stroke();

      doc.fillColor(COLORS.light).fontSize(26).font("Helvetica-Bold");
      const titleLines = doc.font("Helvetica-Bold").text(`Análise de Viralidade`, 54, 150, { width: doc.page.width - 108 });

      doc.fontSize(16).fillColor(COLORS.gray).text("Nicho: " + niche, 54, 200);
      doc.fontSize(10).fillColor(COLORS.gray).text("Gerado em " + new Date().toLocaleString("pt-BR"), 54, 225);

      // Resumo dos números
      const avgScore =
        (result.suggestions ?? []).length > 0
          ? Math.round(
              result.suggestions.reduce((acc, s) => acc + s.viralityScore, 0) /
                result.suggestions.length
            )
          : 0;
      doc.fontSize(11).fillColor(COLORS.light);
      doc
        .text(`Score médio das sugestões: ${avgScore}/100`, 54, 265)
        .text(`${(result.suggestions ?? []).length} sugestões prontas para gravar`, 54, 285)
        .text(`${(result.patterns ?? []).length} padrões de viralidade identificados`, 54, 305);

      doc.addPage();

      // ===== Sugestões =====
      doc.fillColor(COLORS.dark).rect(0, 0, doc.page.width, doc.page.height).fill();
      doc.fillColor(COLORS.amber).fontSize(12).text("SUGESTÕES PARA GRAVAR", 54, 54, { characterSpacing: 3 });

      (result.suggestions ?? []).forEach((s, i) => {
        // Card de fundo
        doc
          .fillColor(COLORS.cardBg)
          .roundedRect(54, doc.y + 14, doc.page.width - 108, 268, 6)
          .fill();

        const startX = doc.y + 30;
        doc.fillColor(COLORS.light).fontSize(13).font("Helvetica-Bold").text(`#${i + 1}  ${s.title}`, 70, startX, {
          width: doc.page.width - 200,
        });

        // Score badge
        doc
          .fillColor(scoreColor(s.viralityScore))
          .roundedRect(doc.page.width - 140, startX - 4, 86, 26, 13)
          .fill();
        doc.fillColor(COLORS.dark).fontSize(10).font("Helvetica-Bold").text(`${s.viralityScore}/100`, doc.page.width - 132, startX + 3);

        doc.fillColor(COLORS.amber).fontSize(8.5).text("HOOK DE ABERTURA", 70, startX + 34, { characterSpacing: 2 });
        doc.fillColor(COLORS.light).fontSize(10).font("Helvetica-Oblique");
        doc.text(s.hook, 70, startX + 47, { width: doc.page.width - 160, lineBreak: true });

        doc.fillColor(COLORS.amber).fontSize(8.5).text("ÂNGULO", 70, doc.y + 12, { characterSpacing: 2 });
        doc.fillColor(COLORS.light).fontSize(10).text(s.angle, 70, doc.y + 25, { width: doc.page.width - 160 });

        doc.fillColor(COLORS.amber).fontSize(8.5).text("ESTRUTURA NARRATIVA", 70, doc.y + 12, { characterSpacing: 2 });
        doc.fillColor(COLORS.light).fontSize(9.5).text(s.narrativeStructure, 70, doc.y + 25, { width: doc.page.width - 160 });

        doc.fillColor(COLORS.gray).fontSize(9).text(`Duração alvo: ${s.targetLength} · ${s.reasoning}`, 70, doc.y + 12, {
          width: doc.page.width - 160,
        });

        doc.y = startX + 268 + 22;
        if (doc.y > doc.page.height - 90) doc.addPage();
      });

      // ===== Padrões =====
      if (doc.y > doc.page.height - 60) doc.addPage();
      doc.fillColor(COLORS.amber).fontSize(12).text("PADRÕES DE VIRALIDADE", 54, doc.y, { characterSpacing: 3 });
      doc.y += 18;

      (result.patterns ?? []).forEach((p) => {
        doc.fillColor(COLORS.light).fontSize(11).font("Helvetica-Bold").text(p.pattern, 54, doc.y);
        doc.fillColor(COLORS.gray).fontSize(9.5).font("Helvetica");
        doc.text(`${p.explanation} (score ${p.score}/100 · presente em ${p.evidenceVideoCount} vídeos)`, 54, doc.y + 16, {
          width: doc.page.width - 108,
        });
        doc.y += 48;
        if (doc.y > doc.page.height - 70) doc.addPage();
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
import type { ContentAgenda } from "./extended";

/**
 * Gera um PDF elegante com a agenda de conteúdo do mês.
 */
export async function buildAgendaPdf(agenda: ContentAgenda): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ===== Capa =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(11).text("VYROSCOPE AI", 54, 72, { characterSpacing: 4 });
      doc.moveTo(54, 96).lineTo(150, 96).strokeColor(COLORS.amber).lineWidth(1.5).stroke();

      doc.fillColor(COLORS.light).fontSize(26).font("Helvetica-Bold").text("Agenda de Conteúdo", 54, 150);
      doc.fillColor(COLORS.gray).fontSize(16).text("Plano mensal de publicação", 54, 200);
      doc.fillColor(COLORS.gray).fontSize(11).text("Nicho: " + agenda.niche, 54, 240);
      doc.fillColor(COLORS.gray).fontSize(10).text("Gerado em " + new Date(agenda.generatedAt).toLocaleString("pt-BR"), 54, 265);

      doc.fillColor(COLORS.light).fontSize(11).text("Estratégia do mês:", 54, 310);
      doc.fillColor(COLORS.gray).fontSize(10.5).text(agenda.strategy, 54, 330, { width: doc.page.width - 108 });

      doc.addPage();

      // ===== Semanas =====
      doc.fillColor(COLORS.dark).rect(0, 0, doc.page.width, doc.page.height).fill();
      doc.fillColor(COLORS.amber).fontSize(12).text("PLANO SEMANAL", 54, 54, { characterSpacing: 3 });

      agenda.items.forEach((item, i) => {
        doc
          .fillColor(COLORS.cardBg)
          .roundedRect(54, doc.y + 14, doc.page.width - 108, 196, 6)
          .fill();

        const startX = doc.y + 30;
        doc.fillColor(COLORS.amber).fontSize(10).font("Helvetica-Bold").text(`SEMANA ${item.week}`, 70, startX, {
          characterSpacing: 2,
        });
        doc.fillColor(COLORS.light).fontSize(13).font("Helvetica-Bold").text(item.title, 70, startX + 20, {
          width: doc.page.width - 200,
        });

        doc
          .fillColor(scoreColor(item.viralityScore))
          .roundedRect(doc.page.width - 140, startX - 4, 86, 26, 13)
          .fill();
        doc.fillColor(COLORS.dark).fontSize(10).font("Helvetica-Bold").text(`${item.viralityScore}/100`, doc.page.width - 132, startX + 3);

        doc.fillColor(COLORS.amber).fontSize(8.5).text("HOOK DE ABERTURA", 70, startX + 52, { characterSpacing: 2 });
        doc.fillColor(COLORS.light).fontSize(10).font("Helvetica-Oblique");
        doc.text(item.hook, 70, startX + 65, { width: doc.page.width - 160 });

        doc.fillColor(COLORS.amber).fontSize(8.5).text("OBJETIVO ESTRATÉGICO", 70, doc.y + 12, { characterSpacing: 2 });
        doc.fillColor(COLORS.light).fontSize(10).font("Helvetica");
        doc.text(item.goal, 70, doc.y + 25, { width: doc.page.width - 160 });

        doc.fillColor(COLORS.gray).fontSize(9).text(`Duração alvo: ${item.targetLength}`, 70, doc.y + 12);

        doc.y = startX + 196 + 22;
        if (doc.y > doc.page.height - 60 && i < agenda.items.length - 1) doc.addPage();
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Gera um PDF elegante com a galeria de favoritos organizada por pastas.
 * Cada pasta (ou a raiz "Galeria") vira uma seção; as thumbnails aparecem
 * em grade com o indicador numérico da ordem manual, título e análise.
 */
export async function buildFavoritesPdf(rows: FavoritesExportRow[]): Promise<Buffer> {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Nada para exportar: a galeria está vazia.");
  }
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const total = rows.reduce((acc, r) => acc + r.thumbnails.length, 0);

      // ===== Capa =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(11).text("VYROSCOPE AI", 54, 72, { characterSpacing: 4 });
      doc.moveTo(54, 96).lineTo(150, 96).strokeColor(COLORS.amber).lineWidth(1.5).stroke();

      doc.fillColor(COLORS.light).fontSize(26).font("Helvetica-Bold").text("Galeria de Favoritos", 54, 150);
      doc.fillColor(COLORS.gray).fontSize(16).text("Thumbnails geradas pela IA", 54, 200);
      doc.fillColor(COLORS.gray).fontSize(11).text(`Total de ${total} thumbnail${total === 1 ? "" : "s"} em ${rows.length} ${rows.length === 1 ? "seção" : "seções"}`, 54, 240);
      doc.fillColor(COLORS.gray).fontSize(10).text("Gerado em " + new Date().toLocaleString("pt-BR"), 54, 265);

      doc.addPage();

      // ===== Uma seção por pasta =====
      (async () => {
        for (let si = 0; si < rows.length; si++) {
          const section = rows[si];
          if (section.thumbnails.length === 0) continue;
          const folderLabel = section.folder.name ?? "Galeria (sem pasta)";

          doc.fillColor(COLORS.amber).fontSize(12).text(folderLabel.toUpperCase(), 54, 54, { characterSpacing: 3 });
          doc.y += 14;
          doc.moveTo(54, doc.y).lineTo(doc.page.width - 54, doc.y).strokeColor(COLORS.amber).lineWidth(0.75).stroke();
          doc.y += 16;

          const hasOrder = section.thumbnails.some((t) => t.sortOrder !== null);

          for (let i = 0; i < section.thumbnails.length; i++) {
            const t = section.thumbnails[i];
            const col = i % 2;
            if (col === 0 && i > 0) doc.y += 152;
            if (doc.y > doc.page.height - 190) {
              doc.addPage();
              if (col === 1) doc.y = 54;
            }
            const w = 235;
            const h = 132;
            const x = col === 0 ? 54 : doc.page.width - 54 - w;
            const y = doc.y;

            doc.fillColor(COLORS.cardBg).roundedRect(x, y, w, h, 5).fill();

            // Indicador de ordem manual
            if (hasOrder) {
              doc.fillColor(COLORS.amber).roundedRect(x + 8, y + 8, 30, 18, 9).fill();
              doc.fillColor(COLORS.dark).fontSize(9).font("Helvetica-Bold").text(String(t.sortOrder ?? ""), x + 12, y + 13);
            }

            // Imagem (download síncrono da URL pública)
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 6000);
              const imgResp = await fetch(t.imageUrl, { signal: controller.signal });
              clearTimeout(timeout);
              if (imgResp.ok) {
                const buf = Buffer.from(await imgResp.arrayBuffer());
                doc.image(buf, x + 6, y + 4, { width: w - 12, height: h - 8, fit: [w - 12, h - 8], align: "center", valign: "center" });
              }
            } catch {
              doc.fillColor(COLORS.gray).fontSize(9).text("(imagem indisponível)", x + w / 2 - 55, y + h / 2 - 6);
            }

            // Título sugerido associado abaixo da imagem
            doc.fillColor(COLORS.amber).fontSize(6.5).font("Helvetica-Bold");
            doc.text("SUGESTÃO ASSOCIADA", x, y + h + 6, { width: w, characterSpacing: 1 });
            doc.fillColor(COLORS.light).fontSize(8.5).font("Helvetica");
            doc.text(t.suggestionTitle, x, y + h + 13, { width: w, lineBreak: true, height: 16 });
            doc.fillColor(COLORS.gray).fontSize(7.5);
            doc.text(`${t.niche} · ${new Date(t.createdAt).toLocaleDateString("pt-BR")}`, x, y + h + 30, { width: w, lineBreak: true });
          }

          doc.y += 36;
          if (si < rows.length - 1 && doc.y > doc.page.height - 60) doc.addPage();
        }

        doc.end();
      })().catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}
