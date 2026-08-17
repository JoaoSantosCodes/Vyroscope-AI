import PDFDocument from "pdfkit";
import {
  estimateMonthlyCostBrl,
  getBlockedAttempts,
  getFxRateHistory,
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

      const [summary, series, limits, budgets, blocked, cost, fxSeries] = await Promise.all([
        getUsageSummary(userId),
        getUsageDailySeries(userId, Math.min(days, 90)),
        getUserLimits(userId),
        getUsageBudgets(userId),
        getBlockedAttempts(userId, 100),
        estimateMonthlyCostBrl(userId),
        getFxRateHistory(90),
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

      // ===== Custo estimado do mês (Rodada 39) =====
      const fmtBrl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Custo estimado de LLM (mês corrente)", 54, doc.y + 34);
      doc.y += 74;
      doc.fillColor(COLORS.light).fontSize(10).text(`Modelo utilizado: ${cost.model} (${cost.priceFrom === "settings" ? "configurado por você" : cost.priceFrom === "env" ? "padrão do servidor" : "padrão"}${cost.fallback ? ", preço estimado" : ""})`, 54, doc.y);
      doc.y += 16;
      doc.text(`Consumo do mês: ${cost.monthTokens.toLocaleString("pt-BR")} tokens`, 54, doc.y);
      doc.text(`Custo até hoje: ${fmtBrl(cost.monthCostBrl)}`, 300, doc.y);
      doc.y += 16;
      doc.fillColor(COLORS.gray).fontSize(9).text(`Câmbio USD/BRL: ${cost.usdBrl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} (cotação atualizada${cost.fxSource === "api" ? ": via API pública" : ""} · fallback: 5,40)`, 54, doc.y);
      doc.y += 16;
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
      if (cost.projectedMonthCostBrl !== null) {
        doc.fillColor(COLORS.amber).fontSize(10).text(
          `Projeção do mês completo (dia ${cost.daysElapsed} de ${daysInMonth}): ${fmtBrl(cost.projectedMonthCostBrl)} pelo ritmo médio diário`,
          54,
          doc.y,
          { width: doc.page.width - 108 }
        );
      } else {
        doc.fillColor(COLORS.gray).fontSize(10).text("Fim do mês: sem projeção pro-rata.", 54, doc.y);
      }
      doc.y += 20;

      // ===== Custos de thumbnails (Rodada 40) =====
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Custo de thumbnails geradas (mês corrente)", 54, doc.y + 34);
      doc.y += 74;
      doc.fillColor(COLORS.light).fontSize(10).text("Modelo de imagem: " + cost.imageModel + (cost.imageModelFrom === "settings" ? " (configurado por você)" : " (padrão dall-e-3)"), 54, doc.y);
      doc.y += 16;
      doc.text(`Thumbnails geradas no mês: ${cost.monthThumbnails.toLocaleString("pt-BR")}`, 54, doc.y);
      doc.text(`Custo estimado: ${fmtBrl(cost.imageCostBrl)} (USD 0,04/geração)`, 300, doc.y);
      doc.y += 16;
      doc.fillColor(COLORS.amber).fontSize(10).text(
        `Custo total do mês até hoje (tokens LLM + thumbnails): ${fmtBrl(cost.totalMonthCostBrl)}`,
        54,
        doc.y,
        { width: doc.page.width - 108 }
      );
      doc.y += 26;

      // ===== Custo por modelo de IA (Rodada 41) =====
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Custo por modelo de IA (mês corrente)", 54, doc.y + 34);
      doc.y += 74;
      doc.fillColor(COLORS.light).fontSize(9).font("Helvetica-Bold").text("Modelo", 54, doc.y);
      doc.text("Tokens", 300, doc.y);
      doc.text("Custo estimado", 420, doc.y);
      doc.moveTo(54, doc.y + 14).lineTo(doc.page.width - 54, doc.y + 14).strokeColor(COLORS.gray).lineWidth(0.5).stroke();
      doc.y += 22;
      const costByModel = Array.isArray(cost.costByModel) ? cost.costByModel : [];
      if (costByModel.length === 0) {
        doc.fillColor(COLORS.gray).fontSize(9).text("Nenhum consumo de LLM registrado neste mês.", 54, doc.y);
        doc.y += 16;
      }
      for (const m of costByModel) {
        if (doc.y > doc.page.height - 30) doc.addPage();
        doc.fillColor(COLORS.light).fontSize(9).text(m.model, 54, doc.y, { width: 240 });
        doc.text(m.tokens.toLocaleString("pt-BR"), 300, doc.y);
        doc.text(fmtBrl(m.costBrl), 420, doc.y);
        doc.y += 16;
      }
      doc.y += 10;
      const fxMin = fxSeries.length ? Math.min(...fxSeries.map((f) => f.rate)) : null;
      const fxMax = fxSeries.length ? Math.max(...fxSeries.map((f) => f.rate)) : null;
      const fxAvg = fxSeries.length ? fxSeries.reduce((acc, f) => acc + f.rate, 0) / fxSeries.length : null;
      if (fxMin !== null && fxMax !== null && fxAvg !== null) {
        doc.fillColor(COLORS.gray).fontSize(9).text(
          `Cotações do período (90 dias): mínima ${fxMin.toFixed(2)} · máxima ${fxMax.toFixed(2)} · média ${fxAvg.toFixed(2)} BRL/USD`,
          54,
          doc.y,
          { width: doc.page.width - 108 }
        );
        doc.y += 14;
        doc.text(
          `Custo total do mês até hoje: ${fmtBrl(cost.totalMonthCostBrl)}`,
          54,
          doc.y,
          { width: doc.page.width - 108 }
        );
        doc.y += 18;
      }

      // ===== Gráfico de consumo diário (Rodada 39) =====
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.fillColor(COLORS.dark).rect(0, doc.y + 24, doc.page.width, 36).fill();
      doc.fillColor(COLORS.amber).fontSize(13).font("Helvetica-Bold").text("Gráfico de consumo diário", 54, doc.y + 34);
      doc.y += 74;
      renderUsageChart(doc, series.llm, series.youtube, Math.min(days, series.llm.length));

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

/** (Rodada 39) Gráfico de barras empilhadas: tokens LLM (âmbar) e cota YouTube
 * (azul) dos últimos `days` dias. Escala normalizada pelo maior dia. */
export function renderUsageChart(
  doc: InstanceType<typeof PDFDocument>,
  llm: Array<{ date: string; tokens: number; units: number; requests: number }>,
  youtube: Array<{ date: string; tokens: number; units: number; requests: number }>,
  days: number
): void {
  const chartWidth = doc.page.width - 108;
  const maxBarHeight = 120;
  const n = Math.min(days, llm.length);
  const window = llm.slice(-n);
  const ytWindow = youtube.slice(-n);
  if (window.length === 0) {
    doc.fillColor("#8A8A95").fontSize(10).text("Sem dados de consumo no período.", 54, doc.y);
    doc.y += 16;
    return;
  }
  let maxCombined = 0;
  const combined = window.map((d, i) => {
    const llmVal = d.tokens + d.units;
    const ytVal = (ytWindow[i]?.tokens ?? 0) + (ytWindow[i]?.units ?? 0);
    maxCombined = Math.max(maxCombined, llmVal + ytVal);
    return { date: d.date, llmVal, ytVal };
  });
  if (maxCombined === 0) {
    doc.fillColor("#8A8A95").fontSize(10).text("Nenhum consumo registrado no período.", 54, doc.y);
    doc.y += 16;
    return;
  }
  const scale = (v: number) => (v / maxCombined) * maxBarHeight;
  const barWidth = Math.min(26, Math.max(4, Math.floor(chartWidth / n) - 2));
  const gap = (chartWidth - barWidth * n) / Math.max(1, n - 1);
  const startX = 54;
  const yAxis = doc.y;
  doc.fillColor("#E8A33D").fontSize(9).text("Tokens LLM", startX, yAxis - 14);
  doc.fillColor("#3D6FE8").text("Cota YouTube", startX + 70, yAxis - 14);
  doc.moveTo(startX, yAxis - 6).lineTo(startX + chartWidth, yAxis - 6).strokeColor("#8A8A95").lineWidth(0.5).stroke();
  combined.forEach((c, i) => {
    const x = startX + i * (barWidth + gap);
    const lh = scale(c.llmVal);
    const yh = scale(c.ytVal);
    if (lh > 0) doc.rect(x, yAxis - lh, barWidth, lh).fillColor("#E8A33D").fill();
    if (yh > 0) doc.rect(x, yAxis - lh - yh, barWidth, yh).fillColor("#3D6FE8").fill();
  });
  doc.fillColor("#8A8A95").fontSize(8).text(`De: ${window[0].date} · Até: ${window[window.length - 1].date}`, startX, yAxis + 6);
  doc.y = yAxis + 26;
}
