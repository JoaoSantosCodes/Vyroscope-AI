import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import { buildAgendaPdf, buildAnalysisPdf, buildFavoritesPdf } from "./exportPdf";
import { buildUsagePdf } from "./usagePdf";
import type { FavoritesExportRow } from "./exportPdf";
import type { AnalysisResult } from "./analysis";
import type { ContentAgenda } from "./extended";

const bodySchema = z.object({
  result: z.any(),
  niche: z.string().trim().min(1).max(120),
});

const agendaBodySchema = z.object({
  agenda: z.any(),
});

/**
 * POST /api/export-pdf — gera o PDF da análise e o devolve como download.
 * Rota protegida: exige usuário autenticado via a mesma validação de sessão
 * usada pelos procedimentos tRPC.
 */
export function registerExportPdfRoute(app: Express) {
  app.post("/api/export-pdf", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Faça login para exportar a análise." });
      return;
    }

    const parse = bodySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Dados inválidos para exportação." });
      return;
    }

    try {
      const result = parse.data.result as AnalysisResult;
      const buffer = await buildAnalysisPdf(result, parse.data.niche);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment");
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Falha ao gerar o PDF." });
    }
  });

  app.post("/api/export-agenda-pdf", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Faça login para exportar a agenda." });
      return;
    }

    const parse = agendaBodySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Dados inválidos para exportação." });
      return;
    }

    try {
      const agenda = parse.data.agenda as ContentAgenda;
      const buffer = await buildAgendaPdf(agenda);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="agenda-${agenda.niche.replace(/\s+/g, "-").toLowerCase()}.pdf"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Falha ao gerar o PDF da agenda." });
    }
  });

  app.post("/api/export-favorites-pdf", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Faça login para exportar os favoritos." });
      return;
    }

    const parse = z.object({ rows: z.array(z.any()).max(500) }).safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Dados inválidos para exportação." });
      return;
    }

    try {
      const rows = parse.data.rows as FavoritesExportRow[];
      if (rows.length === 0) {
        res.status(400).json({ error: "Não há favoritos para exportar." });
        return;
      }
      const buffer = await buildFavoritesPdf(rows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=\"favoritos-vyroscope.pdf\"");
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Falha ao gerar o PDF dos favoritos." });
    }
  });

  /**
   * (Rodada 38) POST /api/export-usage-pdf — relatório de uso e histórico de
   * tentativas bloqueadas em PDF. Corpo: { days } (7–90, padrão 30).
   */
  app.post("/api/export-usage-pdf", async (req: Request, res: Response) => {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Faça login para exportar o relatório de uso." });
      return;
    }

    const parse = z.object({ days: z.number().int().min(7).max(90).optional() }).safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Dados inválidos para exportação." });
      return;
    }

    try {
      const days = parse.data.days ?? 30;
      const buffer = await buildUsagePdf(user.id, days);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="relatorio-uso-vyroscope-${days}d.pdf"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Falha ao gerar o PDF de uso." });
    }
  });
}
