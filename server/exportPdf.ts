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

      const total = rows.reduce((acc, r) => acc + r.thumbnails.length, 0); // await usado somente na IIFE async abaixo

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

/**
 * Um item de ideia do histórico de "Ideia do dia" (com ou sem ideia fixada).
 */
export type IdeaHistoryPdfIdea = {
  date: string;
  niche: string;
  analysisDate?: number;
  title: string;
  hook?: string;
  angle?: string;
  viralityScore: number | null;
  notes?: string | null;
  status?: "planejada" | "gravando" | "publicada" | null;
};

/**
 * Entrada do PDF do histórico de ideias: ideias fixadas sempre no topo,
 * seguidas das ideias rotacionadas do período.
 */
export type IdeaHistoryPdfProductionStats = {
  monthKey: string; // YYYY-MM
  publishedThisMonth: number;
  avgProductionDays: number | null;
  goal: number;
};

export type IdeaHistoryPdfInput = {
  /** Resumo opcional das estatísticas de produção do mês (rodada 19). */
  productionStats?: IdeaHistoryPdfProductionStats | null;
  pinned: IdeaHistoryPdfIdea[];
  /** Ideias arquivadas fora do quadro Kanban (mantidas no histórico) */
  archived?: IdeaHistoryPdfIdea[];
  ideas: IdeaHistoryPdfIdea[];
  /** Nome do usuário para a capa (opcional) */
  userName?: string | null;
};

/**
 * Gera um PDF do calendário editorial com o histórico de ideias do dia:
 * as ideias fixadas aparecem em seção dedicada no topo, seguidas das ideias
 * rotacionadas com data, nicho, score e hook.
 */
export async function buildIdeaHistoryPdf(input: IdeaHistoryPdfInput): Promise<Buffer> {
  if (!input || (!Array.isArray(input.pinned) && !Array.isArray(input.ideas))) {
    throw new Error("Dados inválidos para exportação do histórico.");
  }
  const pinned = Array.isArray(input.pinned) ? input.pinned : [];
  const archived = Array.isArray(input.archived) ? input.archived : [];
  const ideas = Array.isArray(input.ideas) ? input.ideas : [];
  if (pinned.length === 0 && archived.length === 0 && ideas.length === 0) {
    throw new Error("Nada para exportar: o histórico está vazio.");
  }
  const stats = input?.productionStats ?? null;
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const total = pinned.length + archived.length + ideas.length;

      // ===== Capa =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(11).text("VYROSCOPE AI", 54, 72, { characterSpacing: 4 });
      doc.moveTo(54, 96).lineTo(150, 96).strokeColor(COLORS.amber).lineWidth(1.5).stroke();

      doc.fillColor(COLORS.light).fontSize(26).font("Helvetica-Bold").text("Histórico de ideias", 54, 150);
      doc.fillColor(COLORS.gray).fontSize(16).text("Calendário editorial · Ideia do dia", 54, 200);
      doc
        .fillColor(COLORS.gray)
        .fontSize(10)
        .text("Gerado em " + new Date().toLocaleString("pt-BR"), 54, 240);
      doc.fillColor(COLORS.light).fontSize(12).text(`${total} ideia${total === 1 ? "" : "s"} · ${pinned.length} fixada${pinned.length === 1 ? "" : "s"}${archived.length > 0 ? ` · ${archived.length} arquivada${archived.length === 1 ? "" : "s"}` : ""}`, 54, 265);

      // Resumo das estatísticas de produção do mês (rodada 19)
      if (stats) {
        const monthLabel = (() => {
          const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
          const [y, m] = stats.monthKey.split("-");
          return `${MONTHS_PT[(Number.parseInt(m, 10) - 1)] ?? m} de ${y}`;
        })();
        doc.fillColor(COLORS.cardBg).roundedRect(54, 305, doc.page.width - 108, 100, 6).fill();
        doc.fillColor(COLORS.amber).fontSize(9).font("Helvetica-Bold").text("RESUMO DE PRODUÇÃO · " + monthLabel.toUpperCase(), 70, 322, { characterSpacing: 2 });
        doc.fillColor(COLORS.light).fontSize(10.5).font("Helvetica");
        const pct = stats.goal > 0 ? Math.min(100, Math.round((stats.publishedThisMonth / stats.goal) * 100)) : 0;
        doc.text(`${stats.publishedThisMonth} ${stats.publishedThisMonth === 1 ? "publicada" : "publicadas"} no mês · meta de ${stats.goal} (${pct}% concluído)`, 70, 342, { width: doc.page.width - 140 });
        doc.fillColor(COLORS.gray).fontSize(10).text(stats.avgProductionDays === null ? "Tempo médio de produção: sem dados ainda" : `Tempo médio de produção: ${stats.avgProductionDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia${stats.avgProductionDays === 1 ? "" : "s"}`, 70, 362, { width: doc.page.width - 140 });
      }

      doc.addPage();

      const renderSectionHeader = (label: string, count: number) => {
        doc.fillColor(COLORS.dark).rect(0, 0, doc.page.width, doc.page.height).fill();
        doc.fillColor(COLORS.amber).fontSize(12).text(label, 54, 54, { characterSpacing: 3 });
        doc.fillColor(COLORS.gray).fontSize(9).text(`${count} ideia${count === 1 ? "" : "s"}`, 54, 74);
        doc.y = 104;
      };

      const STATUS_LABEL: Record<string, string> = {
        planejada: "PLANEJADA",
        gravando: "GRAVANDO",
        publicada: "PUBLICADA",
      };

      const ideaCardHeight = (idea: IdeaHistoryPdfIdea) => {
        let h = idea.hook ? 118 : 92;
        if (idea.notes) h += 26;
        if (idea.status) h += 22;
        return h;
      };

      const renderIdeaCard = (idea: IdeaHistoryPdfIdea) => {
        const h = ideaCardHeight(idea);
        const y = doc.y + 10;
        doc.fillColor(COLORS.cardBg).roundedRect(54, y, doc.page.width - 108, h, 6).fill();
        const startX = y + 18;
        const score = idea.viralityScore ?? 0;

        doc
          .fillColor(scoreColor(score))
          .roundedRect(70, startX - 4, 52, 22, 11)
          .fill();
        doc.fillColor(COLORS.dark).fontSize(9).font("Helvetica-Bold").text(`${score}/100`, 78, startX + 1);

        doc.fillColor(COLORS.light).fontSize(8).font("Helvetica").text(`${idea.niche} · ${new Date(idea.date + "T12:00:00").toLocaleDateString("pt-BR")}`, 134, startX);
        doc.fillColor(COLORS.light).fontSize(12).font("Helvetica-Bold").text(idea.title, 70, startX + 26, {
          width: doc.page.width - 140,
        });
        if (idea.status) {
          const label = STATUS_LABEL[idea.status] ?? idea.status.toUpperCase();
          doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text(`STATUS: ${label}`, 70, startX + 29, { characterSpacing: 2 });
        }
        if (idea.hook) {
          doc.fillColor(COLORS.amber).fontSize(8.5).text("HOOK", 70, startX + 52, { characterSpacing: 2 });
          doc.fillColor(COLORS.light).fontSize(10).font("Helvetica-Oblique");
          doc.text(idea.hook, 70, startX + 65, { width: doc.page.width - 160 });
        }
        if (idea.angle) {
          doc.fillColor(COLORS.amber).fontSize(8.5).text("ÂNGULO", 70, doc.y + 10, { characterSpacing: 2 });
          doc.fillColor(COLORS.light).fontSize(10).font("Helvetica");
          doc.text(idea.angle, 70, doc.y + 23, { width: doc.page.width - 160 });
        }
        if (idea.notes) {
          doc.fillColor(COLORS.amber).fontSize(8.5).text("ANOTAÇÕES", 70, doc.y + 10, { characterSpacing: 2 });
          doc.fillColor(COLORS.light).fontSize(10).font("Helvetica-Oblique");
          doc.text(idea.notes, 70, doc.y + 23, { width: doc.page.width - 160 });
        }
        doc.y = Math.max(y + h + 20, doc.y + h + 12);
      };

      let currentCount = 0;
      if (pinned.length > 0) {
        renderSectionHeader("FIXADAS NO TOPO", pinned.length);
        pinned.forEach((idea) => {
          renderIdeaCard(idea);
          currentCount += 1;
          if (currentCount < total && doc.y > doc.page.height - 60) doc.addPage();
        });
      }

      if (archived.length > 0) {
        if (currentCount > 0 && doc.y > doc.page.height - 60) doc.addPage();
        renderSectionHeader("ARQUIVADAS", archived.length);
        archived.forEach((idea) => {
          renderIdeaCard(idea);
          currentCount += 1;
          if (currentCount < total && doc.y > doc.page.height - 60) doc.addPage();
        });
      }

      if (ideas.length > 0) {
        if (currentCount > 0) doc.addPage();
        renderSectionHeader("IDEIAS ROTACIONADAS", ideas.length);
        ideas.forEach((idea, i) => {
          renderIdeaCard(idea);
          currentCount += 1;
          if (i < ideas.length - 1 && doc.y > doc.page.height - 60) doc.addPage();
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Input do builder do resumo de produção mensal (rodada 20). */
export type MonthlyPdfInput = {
  monthKey: string; // YYYY-MM
  publishedThisMonth: number;
  avgProductionDays: number | null;
  goal: number;
  /** Streak de meses consecutivos com meta cumprida (selo quando > 0). */
  streak?: number;
  /** Dia do mês corrente usado no texto de progresso (ex.: "Dia 20 do mês"). */
  dayOfMonth?: number;
  /** Nome do usuário para a capa (opcional). */
  userName?: string | null;
};

/** Rótulo pt-BR de uma chave YYYY-MM (ex.: "agosto de 2026"). */
export function monthLabelPt(monthKey: string): string {
  const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const [y, m] = monthKey.split("-");
  return `${MONTHS_PT[(Number.parseInt(m ?? "0", 10) - 1)] ?? m} de ${y}`;
}

/**
 * PDF de página única com o resumo de produção de um mês específico
 * (rodada 20): meta, publicadas, percentual concluído, tempo médio de
 * produção, linha do dia do mês e selo motivacional de streak quando há.
 */
export async function buildMonthlyPdf(input: MonthlyPdfInput): Promise<Buffer> {
  if (!input || !/^\d{4}-\d{2}$/.test(input.monthKey ?? "")) {
    throw new Error("Dados inválidos para exportação do resumo mensal.");
  }
  const { monthKey, publishedThisMonth, avgProductionDays, goal } = input;
  const streak = input.streak ?? 0;
  const day = input.dayOfMonth ?? new Date().getDate();
  const userName = input.userName?.trim();
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ===== Capa única =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(11).text("VYROSCOPE AI", 54, 72, { characterSpacing: 4 });
      doc.moveTo(54, 96).lineTo(150, 96).strokeColor(COLORS.amber).lineWidth(1.5).stroke();
      doc.fillColor(COLORS.light).fontSize(24).font("Helvetica-Bold").text("Resumo de produção", 54, 150);
      doc.fillColor(COLORS.gray).fontSize(16).text(monthLabelPt(monthKey), 54, 200);
      doc.fillColor(COLORS.gray).fontSize(10).text("Gerado em " + new Date().toLocaleString("pt-BR") + (userName ? ` · ${userName}` : ""), 54, 240);

      // Card central com os números do mês
      doc.fillColor(COLORS.cardBg).roundedRect(54, 305, doc.page.width - 108, 120, 6).fill();
      doc.fillColor(COLORS.amber).fontSize(9).font("Helvetica-Bold").text("PRODUÇÃO DO MÊS", 70, 322, { characterSpacing: 2 });
      doc.fillColor(COLORS.light).fontSize(10.5).font("Helvetica");
      const pct = goal > 0 ? Math.min(100, Math.round((publishedThisMonth / goal) * 100)) : 0;
      doc.text(`${publishedThisMonth} ${publishedThisMonth === 1 ? "publicada" : "publicadas"} · meta de ${goal} (${pct}% concluído)`, 70, 342, { width: doc.page.width - 140 });
      doc.fillColor(COLORS.gray).fontSize(10).text(avgProductionDays === null ? "Tempo médio de produção: sem dados ainda" : `Tempo médio de produção: ${avgProductionDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia${avgProductionDays === 1 ? "" : "s"}`, 70, 362, { width: doc.page.width - 140 });
      doc.fillColor(COLORS.gray).fontSize(10).text(`Dia ${day} do mês · acompanhamento contínuo no quadro Kanban`, 70, 382, { width: doc.page.width - 140 });

      // Selo motivacional de streak (rodada 20)
      if (streak > 0) {
        doc.fillColor(COLORS.amber).font("Helvetica-Bold").fontSize(12).text(`SELO DE CONSECUTIVIDADE: ${streak} ${streak === 1 ? "mês" : "meses"} seguido${streak === 1 ? "" : "s"} com a meta cumprida`, 70, 460, { width: doc.page.width - 140 });
      } else {
        doc.fillColor(COLORS.gray).fontSize(10).text("Streak atual: nenhum mês consecutivo com a meta cumprida ainda — comece a sequência!", 70, 460, { width: doc.page.width - 140 });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Linha de entrada de um mês no PDF de streaks (rodada 22). */
export type StreakPdfMonthRow = {
  monthKey: string; // YYYY-MM
  label: string; // pt-BR, ex. "agosto de 2026"
  publishedThisMonth: number;
  goal: number;
  met: boolean;
  isCurrent: boolean;
};

/** Input do builder do PDF de streaks (rodada 22). */
export type StreaksPdfInput = {
  /** Histórico mês a mês, mais antigo primeiro (geralmente 12 meses). */
  months: StreakPdfMonthRow[];
  /** Sequência atual de meses consecutivos com meta cumprida. */
  streak?: number;
  /** Meses cumpridos além do corrente (rodada 21). */
  metCount?: number;
  /** Total de publicações no período. */
  totalPublished?: number;
  /** Nome do usuário para a capa (opcional). */
  userName?: string | null;
};

/** Cor da barra do gráfico conforme o status do mês (mesma lógica da UI,
 * rodada 21/22): verde quando a meta foi cumprida, âmbar no mês corrente,
 * roxo translúcido nos demais. */
export function streakBarColor(met: boolean, isCurrent: boolean): string {
  if (met) return "#4C9F70";
  if (isCurrent) return COLORS.amber;
  return "#7C6BC4";
}

/**
 * PDF com o histórico de streaks mensais (rodada 22): capa escura com
 * cartão de KPIs (sequência atual, metas cumpridas e total de publicações),
 * gráfico de barras de 12 meses desenhado com retângulos (publicadas na
 * cor do status, meta como barra fina escura) e tabela mês a mês ordenada
 * do mais recente para o mais antigo com o status de cumprimento.
 */
export async function buildStreaksPdf(input: StreaksPdfInput): Promise<Buffer> {
  if (!input || !Array.isArray(input.months) || input.months.length === 0) {
    throw new Error("Dados inválidos para exportação do histórico de streaks.");
  }
  const months = input.months.slice();
  const streak = input.streak ?? 0;
  const metCount = input.metCount ?? 0;
  const totalPublished = input.totalPublished ?? 0;
  const userName = input.userName?.trim();
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
      doc.fillColor(COLORS.light).fontSize(24).font("Helvetica-Bold").text("Metas mensais · streaks", 54, 150);
      doc.fillColor(COLORS.gray).fontSize(11).text("Histórico de cumprimento da meta de publicações", 54, 190);
      doc.fillColor(COLORS.gray).fontSize(10).text("Gerado em " + new Date().toLocaleString("pt-BR") + (userName ? ` · ${userName}` : ""), 54, 220);

      // ===== Cartão de KPIs =====
      const kpiW = Math.floor((doc.page.width - 108 - 16) / 3);
      doc.fillColor(COLORS.cardBg).roundedRect(54, 260, doc.page.width - 108, 92, 6).fill();
      const kpis = [
        { label: "SEQUÊNCIA ATUAL", value: `${streak} ${streak === 1 ? "mês" : "meses"} seguido${streak === 1 ? "" : "s"}` },
        { label: "METAS CUMPRIDAS", value: `${metCount} ${metCount === 1 ? "mês" : "meses"} no período` },
        { label: "PUBLICAÇÕES", value: `${totalPublished} no período` },
      ];
      kpis.forEach((kpi, i) => {
        const x = 70 + i * (kpiW + 8);
        doc.fillColor(COLORS.amber).fontSize(8).font("Helvetica-Bold").text(kpi.label, x, 278, { characterSpacing: 1 });
        doc.fillColor(COLORS.light).fontSize(10.5).font("Helvetica").text(kpi.value, x, 296, { width: kpiW - 16 });
      });

      // ===== Gráfico de barras (12 meses) =====
      const chartY = 400;
      const chartH = 150;
      doc.fillColor(COLORS.amber).fontSize(9).font("Helvetica-Bold").text("PUBLICAÇÕES POR MÊS", 70, 380, { characterSpacing: 2 });
      const maxPub = Math.max(1, ...months.map((m) => m.publishedThisMonth));
      const maxGoal = Math.max(1, ...months.map((m) => m.goal));
      const chartW = doc.page.width - 108 - 40;
      const slot = chartW / months.length;
      months.forEach((m, i) => {
        const pubH = Math.max(2, Math.round((Math.min(m.publishedThisMonth, maxPub) / maxPub) * chartH));
        const goalH = Math.max(2, Math.round((Math.min(m.goal, maxGoal) / maxGoal) * chartH));
        const x = 70 + i * slot;
        doc.fillColor("#3A3A46").rect(x + slot / 2 - 1.5, chartY + chartH - goalH, 3, goalH).fill();
        doc.fillColor(streakBarColor(m.met, m.isCurrent)).rect(x + slot / 2 + 2.5, chartY + chartH - pubH, 6, pubH).fill();
        doc.save();
        doc.translate(x + slot / 2, chartY + chartH + 8);
        doc.rotate(-45);
        doc.fillColor(COLORS.gray).fontSize(6).text(m.monthKey.slice(2), 0, 0, { align: "center" });
        doc.restore();
      });
      doc.fillColor(COLORS.gray).fontSize(8).text("Barras coloridas: publicadas (verde = meta cumprida, âmbar = mês corrente, roxo = demais) · linha fina = meta", 70, chartY + chartH + 28, { width: doc.page.width - 140 });
      doc.fillColor(COLORS.gray).fontSize(8).text("Último mês do período: " + monthLabelPt(months[months.length - 1].monthKey), 70, chartY + chartH + 42, { width: doc.page.width - 140 });

      // ===== Tabela mês a mês =====
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(10).font("Helvetica-Bold").text("MÊS A MÊS", 54, 72, { characterSpacing: 2 });
      doc.fillColor(COLORS.gray).fontSize(9).text("Meta, publicações e status de cumprimento de cada mês", 54, 96);

      const headerY = 130;
      doc.fillColor(COLORS.cardBg).roundedRect(54, headerY - 10, doc.page.width - 108, 26, 4).fill();
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("MÊS", 70, headerY, { width: 150 });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("META", 240, headerY, { width: 80, align: "right" });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("PUBLICADAS", 330, headerY, { width: 90, align: "right" });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("STATUS", 440, headerY, { width: 110, align: "right" });

      let y = headerY + 34;
      const sorted = [...months].reverse(); // mais recentes primeiro
      sorted.forEach((m) => {
        if (y > doc.page.height - 40) doc.addPage();
        doc.fillColor(m.isCurrent ? COLORS.amber : m.met ? COLORS.light : COLORS.gray).fontSize(9).font(m.isCurrent ? "Helvetica-Bold" : "Helvetica").text(m.label, 70, y, { width: 150 });
        doc.fillColor(m.isCurrent ? COLORS.amber : m.met ? COLORS.light : COLORS.gray).text(`${m.goal}`, 240, y, { width: 80, align: "right" });
        doc.fillColor(m.isCurrent ? COLORS.amber : m.met ? COLORS.light : COLORS.gray).text(`${m.publishedThisMonth}`, 330, y, { width: 90, align: "right" });
        const status = m.isCurrent ? "mês corrente" : m.met ? "meta cumprida" : "não cumprida";
        doc.fillColor(m.isCurrent ? COLORS.amber : m.met ? "#4C9F70" : COLORS.gray).text(status, 440, y, { width: 110, align: "right" });
        y += 22;
      });
      doc.fillColor(COLORS.gray).fontSize(8).text(`Sequência atual: ${streak} ${streak === 1 ? "mês" : "meses"} seguido${streak === 1 ? "" : "s"} · acompanhado no painel de estatísticas do quadro Kanban`, 54, doc.page.height - 40, { width: doc.page.width - 108 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Input do builder do PDF consolidado "Ano em números" (rodada 23). */
export type YearPdfInput = {
  /** Consolidação do ano (série de meses + agregados). */
  summary: {
    year: number;
    months: {
      monthKey: string;
      label: string;
      publishedThisMonth: number;
      avgProductionDays: number | null;
      goal: number;
      ratio: number;
      met: boolean;
      isCurrent: boolean;
    }[];
    totalPublished: number;
    totalGoalsMet: number;
    avgProductionDays: number | null;
    bestMonth: { monthKey: string; label: string; publishedThisMonth: number } | null;
  };
  /** Sequência atual de streak (para o selo na capa). */
  streak?: number;
  /** Nome do usuário para a capa (opcional). */
  userName?: string | null;
};

/**
 * PDF consolidado "Ano em números" (rodada 23): capa escura com 4 KPIs
 * (publicações totais, metas cumpridas, média de produção, melhor mês),
 * gráfico de barras dos meses do ano e tabela mês a mês com % da meta e
 * status de cumprimento.
 */
export async function buildYearPdf(input: YearPdfInput): Promise<Buffer> {
  if (!input?.summary?.months?.length) {
    throw new Error("Dados inválidos para exportação do ano em números.");
  }
  const { summary, streak = 0, userName } = input;
  const { year, months, totalPublished, totalGoalsMet, avgProductionDays, bestMonth } = summary;
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
      doc.fillColor(COLORS.light).fontSize(24).font("Helvetica-Bold").text(`Ano em números · ${year}`, 54, 150);
      doc.fillColor(COLORS.gray).fontSize(11).text("Consolidação das metas mensais de publicações", 54, 190);
      doc.fillColor(COLORS.gray).fontSize(10).text("Gerado em " + new Date().toLocaleString("pt-BR") + (userName ? ` · ${userName}` : ""), 54, 220);

      // ===== Cartão de KPIs =====
      const kpiW = Math.floor((doc.page.width - 108 - 24) / 4);
      doc.fillColor(COLORS.cardBg).roundedRect(54, 260, doc.page.width - 108, 100, 6).fill();
      const kpis = [
        { label: "PUBLICAÇÕES", value: `${totalPublished} no ano` },
        { label: "METAS CUMPRIDAS", value: `${totalGoalsMet} ${totalGoalsMet === 1 ? "mês" : "meses"} do ano` },
        {
          label: "MÉDIA DE PRODUÇÃO",
          value: avgProductionDays !== null ? `${avgProductionDays} dias` : "sem dados",
        },
        {
          label: "MELHOR MÊS",
          value: bestMonth ? `${bestMonth.publishedThisMonth} pub.` : "sem dados",
        },
      ];
      kpis.forEach((kpi, i) => {
        const x = 70 + i * (kpiW + 8);
        doc.fillColor(COLORS.amber).fontSize(8).font("Helvetica-Bold").text(kpi.label, x, 278, { characterSpacing: 1 });
        doc.fillColor(COLORS.light).fontSize(10).font("Helvetica").text(kpi.value, x, 298, { width: kpiW - 16 });
      });
      if (bestMonth) {
        doc.fillColor(COLORS.gray).fontSize(9).text("Melhor mês: " + bestMonth.label, 70, 336, { width: doc.page.width - 140 });
      }
      const seal =
        streak > 0
          ? `SELO DE CONSECUTIVIDADE: ${streak} ${streak === 1 ? "mês" : "meses"} seguido${streak === 1 ? "" : "s"} com a meta cumprida`
          : "Continue a sequência: cada meta cumprida alimenta o selo de consecutividade";
      doc.fillColor(streak > 0 ? "#4C9F70" : COLORS.gray).fontSize(10).font("Helvetica-Bold").text(seal, 70, 400, { width: doc.page.width - 140 });

      // ===== Gráfico de barras (meses do ano) =====
      const chartY = 460;
      const chartH = 150;
      doc.fillColor(COLORS.amber).fontSize(9).font("Helvetica-Bold").text("PUBLICAÇÕES POR MÊS · " + year, 70, 440, { characterSpacing: 2 });
      const maxPub = Math.max(1, ...months.map((m) => m.publishedThisMonth));
      const maxGoal = Math.max(1, ...months.map((m) => m.goal));
      const chartW = doc.page.width - 108 - 40;
      const slot = chartW / months.length;
      months.forEach((m, i) => {
        const pubH = Math.max(2, Math.round((Math.min(m.publishedThisMonth, maxPub) / maxPub) * chartH));
        const goalH = Math.max(2, Math.round((Math.min(m.goal, maxGoal) / maxGoal) * chartH));
        const x = 70 + i * slot;
        doc.fillColor("#3A3A46").rect(x + slot / 2 - 1.5, chartY + chartH - goalH, 3, goalH).fill();
        doc.fillColor(streakBarColor(m.met, m.isCurrent)).rect(x + slot / 2 + 2.5, chartY + chartH - pubH, 6, pubH).fill();
        doc.save();
        doc.translate(x + slot / 2, chartY + chartH + 8);
        doc.rotate(-45);
        doc.fillColor(COLORS.gray).fontSize(6).text(m.monthKey.slice(2), 0, 0, { align: "center" });
        doc.restore();
      });
      doc.fillColor(COLORS.gray).fontSize(8).text("Barras coloridas: publicadas (verde = meta cumprida, âmbar = mês corrente, roxo = demais) · linha fina = meta", 70, chartY + chartH + 28, { width: doc.page.width - 140 });

      // ===== Tabela mês a mês =====
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(10).font("Helvetica-Bold").text(`MÊS A MÊS · ${year}`, 54, 72, { characterSpacing: 2 });
      doc.fillColor(COLORS.gray).fontSize(9).text("Meta, publicações, percentual de cumprimento e status de cada mês", 54, 96);

      const headerY = 130;
      doc.fillColor(COLORS.cardBg).roundedRect(54, headerY - 10, doc.page.width - 108, 26, 4).fill();
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("MÊS", 70, headerY, { width: 140 });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("META", 220, headerY, { width: 70, align: "right" });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("PUBLICADAS", 300, headerY, { width: 90, align: "right" });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("% DA META", 400, headerY, { width: 80, align: "right" });
      doc.fillColor(COLORS.amber).fontSize(8.5).font("Helvetica-Bold").text("STATUS", 490, headerY, { width: 110, align: "right" });

      let y = headerY + 34;
      const sorted = [...months].reverse(); // mais recentes primeiro
      sorted.forEach((m) => {
        if (y > doc.page.height - 40) doc.addPage();
        const accent = m.isCurrent ? COLORS.amber : m.met ? COLORS.light : COLORS.gray;
        doc.fillColor(accent).fontSize(9).font(m.isCurrent ? "Helvetica-Bold" : "Helvetica").text(m.label, 70, y, { width: 140 });
        doc.fillColor(accent).text(`${m.goal}`, 220, y, { width: 70, align: "right" });
        doc.fillColor(accent).text(`${m.publishedThisMonth}`, 300, y, { width: 90, align: "right" });
        doc.fillColor(accent).text(`${m.ratio}%`, 400, y, { width: 80, align: "right" });
        const status = m.isCurrent ? "mês corrente" : m.met ? "meta cumprida" : "não cumprida";
        doc.fillColor(m.isCurrent ? COLORS.amber : m.met ? "#4C9F70" : COLORS.gray).text(status, 490, y, { width: 110, align: "right" });
        y += 22;
      });
      doc.fillColor(COLORS.gray).fontSize(8).text(`Resumo do ano: ${totalPublished} publicações · ${totalGoalsMet} metas cumpridas · sequência atual de ${streak} ${streak === 1 ? "mês" : "meses"}`, 54, doc.page.height - 40, { width: doc.page.width - 108 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
