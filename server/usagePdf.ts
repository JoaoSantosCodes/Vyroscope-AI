import PDFDocument from "pdfkit";
import {
  getBlockedAttempts,
  getUserLimits,
  getUsageBudgets,
  getUsageDailySeries,
  getUsageSummary,
  projectExhaustion,
} from "./db";
import type { LimitStatus } from "./db";

const COLORS = {
  dark: "#0C0C10",
  amber: "#E8A33D",
  gray: "#8A8A95",
  light: "#E9E9EE",
  cardBg: "#16161D",
  warn: "#C75454",
  ok: "#4C9F70",
};

const DIM_LABEL: Record<string, string> = {
  analyses: "Análises",
  tokens: "Tokens LLM",
  quota: "Cota YouTube",
  weekly_tokens: "Tokens (semana)",
  monthly_tokens: "Tokens (mês)",
};

/**
 * (Rodada 38) Relatório de uso em PDF: capa, resumo por período (hoje/semana/
 * mês), tabela diária com limite configurado e histórico de tentativas
 * bloqueadas.
 */
export async function buildUsagePdf(userId: number, days = 30): Promise<Buffer> {
  return new Promise<Buffer>(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 54 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const todayIso = new Date().toISOString().slice(0, 10);

      const [summary, series, limits, budgets, blocked] = await Promise.all([
        getUsageSummary(userId),
        getUsageDailySeries(userId, Math.min(days, 90)),
        getUserLimits(userId),
        getUsageBudgets(userId),
        getBlockedAttempts(userId, 100),
      ]);

      const llmT = summary.llm;
      const ytT = summary.youtube;
      const weekIso = budgets.weekStartIso;
      const monthIso = budgets.monthStartIso;

      const totalTokenToday = llmT.today.tokens + ytT.today.tokens;
      const totalQuotaToday = llmT.today.units + ytT.today.units;
      const totalTokenWeek = llmT.week.tokens + ytT.week.tokens;
      const totalQuotaWeek = llmT.week.units + ytT.week.units;
      const totalTokenMonth = llmT.month.tokens + ytT.month.tokens;
      const totalQuotaMonth = llmT.month.units + ytT.month.units;

      const tokenWeekProj = projectExhaustion({ consumed: totalTokenWeek, cap: limits.weeklyTokenLimit, windowStartIso: weekIso, todayIso });
      const quotaWeekProj = projectExhaustion({ consumed: totalQuotaWeek, cap: limits.weeklyQuotaLimit, windowStartIso: weekIso, todayIso });
      const tokenMonthProj = projectExhaustion({ consumed: totalTokenMonth, cap: limits.monthlyTokenLimit, windowStartIso: monthIso, todayIso });
      const quotaMonthProj = projectExhaustion({ consumed: totalQuotaMonth, cap: limits.monthlyQuotaLimit, windowStartIso: monthIso, todayIso });

      const dailyRows = series.limitByDay.map((l, i) => {
        const llm = series.llm[i] ?? { tokens: 0, units: 0, requests: 0 };
        const yt = series.youtube[i] ?? { tokens: 0, units: 0, requests: 0 };
        return { date: l.date, tokens: llm.tokens + yt.tokens, quota: llm.units + yt.units, requests: llm.requests + yt.requests };
      });

      // ===== Capa =====
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.dark);
      doc.fillColor(COLORS.amber).fontSize(11).text("VYROSCOPE AI", 54, 72, { characterSpacing: 4 });
      doc.moveTo(54, 96).lineTo(150, 96).strokeColor(COLORS.amber).lineWidth(1.5).stroke();
      doc.fillColor(COLORS.light).fontSize(26).font("Helvetica-Bold").text("Relatório de Uso", 54, 150);
      doc.fillColor(COLORS.gray).fontSize(12).text(
        `Período: ${days} dias · Gerado em ${new Date().toLocaleString("pt-BR")}`,
        54,
        200
      );

      const kpiY = () => doc.y + 30;

      // ===== Resumo por período =====
      doc.addPage();
      doc.fillColor(COLORS.dark).rect(0, 0, doc.page.width, 70).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Resumo de consumo", 54, 24);

      let y = 96;
      doc.fillColor(COLORS.light).fontSize(11).font("Helvetica-Bold").text("Período", 54, y);
      doc.text("Tokens (LLM + YouTube)", 200, y);
      doc.text("Cota (unidades)", 360, y);
      doc.text("Requisições", 480, y);
      doc.moveTo(54, y + 16).lineTo(doc.page.width - 54, y + 16).strokeColor(COLORS.gray).lineWidth(0.5).stroke();

      const rows = [
        { label: "Hoje", tokens: totalTokenToday, quota: totalQuotaToday, requests: llmT.today.requests + ytT.today.requests },
        { label: "Semana (7d)", tokens: totalTokenWeek, quota: totalQuotaWeek, requests: llmT.week.requests + ytT.week.requests },
        { label: "Mês", tokens: totalTokenMonth, quota: totalQuotaMonth, requests: llmT.month.requests + ytT.month.requests },
      ];
      y += 28;
      for (const r of rows) {
        doc.fillColor(COLORS.light).fontSize(10).text(r.label, 54, y);
        doc.text(r.tokens.toLocaleString("pt-BR"), 200, y);
        doc.text(r.quota.toLocaleString("pt-BR"), 360, y);
        doc.text(r.requests.toLocaleString("pt-BR"), 480, y);
        y += 20;
      }

      // ===== Orçamentos e projeções =====
      y = kpiY();
      const projRow = (label: string, consumed: number, cap: number, proj: ReturnType<typeof projectExhaustion>) => {
        if (doc.y > doc.page.height - 110) {
          doc.addPage();
          y = 96;
        }
        const capStr = cap > 0 ? cap.toLocaleString("pt-BR") : "Ilimitado";
        const pct = cap > 0 ? Math.min(100, Math.round((consumed / cap) * 100)) : 0;
        doc.fillColor(COLORS.light).fontSize(10).text(`${label}`, 54, doc.y);
        doc.text(`Consumido: ${consumed.toLocaleString("pt-BR")} / Limite: ${capStr} (${pct}%)`, 220, doc.y);
        if (cap > 0 && proj.estimatedDayIso) {
          doc.fillColor(proj.exhausted ? COLORS.warn : COLORS.amber);
          doc.text(
            proj.exhausted ? "Limite atingido" : `Esgotamento estimado: ${proj.estimatedDayIso} (${proj.daysLeft} dias)`,
            440,
            doc.y
          );
        }
        doc.y += 18;
      };
      projRow("Tokens — semana", totalTokenWeek, limits.weeklyTokenLimit, tokenWeekProj);
      projRow("Cota — semana", totalQuotaWeek, limits.weeklyQuotaLimit, quotaWeekProj);
      projRow("Tokens — mês", totalTokenMonth, limits.monthlyTokenLimit, tokenMonthProj);
      projRow("Cota — mês", totalQuotaMonth, limits.monthlyQuotaLimit, quotaMonthProj);

      // ===== Limites configurados =====
      if (doc.y > doc.page.height - 180) doc.addPage();
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Limites diários configurados", 54, doc.y + 34);
      doc.y += 74;
      const dailyRows2 = [
        { label: "Análises/dia", value: limits.dailyAnalysisLimit, dim: "analyses" },
        { label: "Tokens LLM/dia", value: limits.dailyTokenLimit, dim: "tokens" },
        { label: "Cota YouTube/dia", value: limits.dailyQuotaLimit, dim: "quota" },
      ];
      for (const r of dailyRows2) {
        if (doc.y > doc.page.height - 30) doc.addPage();
        doc.fillColor(COLORS.light).fontSize(10).text(r.label, 54, doc.y);
        doc.text(r.value > 0 ? r.value.toLocaleString("pt-BR") : "Ilimitado", 300, doc.y);
        doc.y += 18;
      }

      // ===== Tabela diária (últimos N dias) =====
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Consumo diário", 54, doc.y + 34);
      doc.y += 74;
      doc.fillColor(COLORS.light).fontSize(9).font("Helvetica-Bold").text("Data", 54, doc.y);
      doc.text("Tokens", 150, doc.y);
      doc.text("Cota", 260, doc.y);
      doc.text("Req.", 370, doc.y);
      doc.moveTo(54, doc.y + 14).lineTo(doc.page.width - 54, doc.y + 14).strokeColor(COLORS.gray).lineWidth(0.5).stroke();
      doc.y += 22;
      const shown = dailyRows.slice(-Math.min(days, dailyRows.length)).reverse();
      for (const r of shown) {
        if (doc.y > doc.page.height - 24) {
          doc.addPage();
          doc.fillColor(COLORS.light).fontSize(9).font("Helvetica-Bold").text("Data", 54, 54);
          doc.text("Tokens", 150, 54);
          doc.text("Cota", 260, 54);
          doc.text("Req.", 370, 54);
          doc.moveTo(54, 68).lineTo(doc.page.width - 54, 68).strokeColor(COLORS.gray).lineWidth(0.5).stroke();
          doc.y = 78;
        }
        doc.fillColor(COLORS.light).fontSize(9).text(r.date, 54, doc.y);
        doc.text(r.tokens.toLocaleString("pt-BR"), 150, doc.y);
        doc.text(r.quota.toLocaleString("pt-BR"), 260, doc.y);
        doc.text(r.requests.toLocaleString("pt-BR"), 370, doc.y);
        doc.y += 14;
      }

      // ===== Tentativas bloqueadas =====
      if (doc.y > doc.page.height - 160) doc.addPage();
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Tentativas bloqueadas", 54, doc.y + 34);
      doc.y += 74;
      if (blocked.length === 0) {
        doc.fillColor(COLORS.gray).fontSize(10).text("Nenhuma tentativa bloqueada no período.", 54, doc.y);
        doc.y += 18;
      }
      for (const b of blocked) {
        if (doc.y > doc.page.height - 60) {
          doc.addPage();
          doc.fillColor(COLORS.dark).rect(0, 0, doc.page.width, 36).fill();
          doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Tentativas bloqueadas (continuação)", 54, 14);
          doc.y = 60;
        }
        const status = b.confirmedAt ? "Confirmada" : "Bloqueada";
        doc.fillColor(COLORS.light).fontSize(10).font("Helvetica-Bold").text(`${new Date(b.attemptedAt).toLocaleString("pt-BR")} — ${DIM_LABEL[b.dimension] ?? b.dimension}`, 54, doc.y);
        doc.fillColor(b.confirmedAt ? COLORS.ok : COLORS.warn).text(status, 430, doc.y);
        doc.y += 14;
        doc.fillColor(COLORS.gray).fontSize(9).text(
          `Limite: ${b.limitValue.toLocaleString("pt-BR")} · Consumo no momento: ${b.currentUsage.toLocaleString("pt-BR")}${b.analysisId ? ` · Análise: ${b.analysisId}` : ""}`,
          54,
          doc.y
        );
        if (b.reason) {
          doc.y += 12;
          doc.text(b.reason, 54, doc.y, { width: doc.page.width - 108 });
          doc.y += doc.heightOfString(b.reason, { width: doc.page.width - 108 });
        }
        doc.y += 12;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
