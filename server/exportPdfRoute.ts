import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import { buildAnalysisPdf } from "./exportPdf";
import type { AnalysisResult } from "./analysis";

const bodySchema = z.object({
  result: z.any(),
  niche: z.string().trim().min(1).max(120),
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
}
