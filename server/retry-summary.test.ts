// (Rodada 34) Resumo compacto de retentativas no histórico de análises
import { describe, expect, it } from "vitest";
import { parseRetrySummary } from "./db";

describe("parseRetrySummary", () => {
  it("retorna null quando não há log", () => {
    expect(parseRetrySummary(null)).toBeNull();
    expect(parseRetrySummary("")).toBeNull();
  });

  it("retorna null para JSON inválido", () => {
    expect(parseRetrySummary("not json")).toBeNull();
    expect(parseRetrySummary("123")).toBeNull();
  });

  it("retorna null para array vazio", () => {
    expect(parseRetrySummary("[]")).toBeNull();
  });

  it("resumo de tentativa única bem-sucedida", () => {
    const raw = JSON.stringify([
      { attempt: 1, at: 1000, type: "succeeded", message: "ok" },
    ]);
    const summary = parseRetrySummary(raw);
    expect(summary).toEqual({ attempts: 1, failures: 0, gaveUp: false });
  });

  it("conta tentativas e falhas com retentativas", () => {
    const raw = JSON.stringify([
      { attempt: 1, at: 1000, type: "retrying", message: "quota", waitSeconds: 5 },
      { attempt: 2, at: 6000, type: "retrying", message: "redund", waitSeconds: 10 },
      { attempt: 3, at: 16000, type: "succeeded", message: "ok" },
    ]);
    const summary = parseRetrySummary(raw);
    expect(summary).toEqual({ attempts: 3, failures: 2, gaveUp: false, firstRetryAt: 6000 });
  });

  it("marca gaveUp e registra primeira retentativa", () => {
    const raw = JSON.stringify([
      { attempt: 1, at: 1000, type: "retrying", message: "quota", waitSeconds: 5 },
      { attempt: 2, at: 6000, type: "giving_up", message: "desistiu" },
    ]);
    const summary = parseRetrySummary(raw);
    expect(summary?.gaveUp).toBe(true);
    expect(summary?.attempts).toBe(2);
    expect(summary?.failures).toBe(2);
    expect(summary?.firstRetryAt).toBe(6000);
  });

  it("ignora entradas não numéricas de forma tolerante", () => {
    const raw = JSON.stringify([{ attempt: 1, at: 1, type: "succeeded", message: "x" }, "garbage"]);
    const summary = parseRetrySummary(raw);
    expect(summary?.attempts).toBe(1);
  });
});
