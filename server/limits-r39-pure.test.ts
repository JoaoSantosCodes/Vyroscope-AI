import { describe, expect, it } from "vitest";
import { estimateTokensCostBrl, LLM_MODEL_PRICES, USD_TO_BRL } from "./db";

// (Rodada 39) Funções puras e constantes de custo — testadas diretamente
// sobre o módulo real (sem mocks), pois não dependem do banco de dados.

describe("(Rodada 39) estimateTokensCostBrl — função pura de custo", () => {
  it("converte tokens × preço médio (input+output)/2 em USD para BRL com câmbio 5,4", () => {
    const res = estimateTokensCostBrl({ tokens: 2_000_000, pricePerMillionInput: 0.4, pricePerMillionOutput: 1.6 });
    expect(res.costBrl).toBeCloseTo((2_000_000 / 1_000_000) * 1.0 * USD_TO_BRL, 4);
  });

  it("zera consumo negativo e usa o preço médio do catálogo", () => {
    const res = estimateTokensCostBrl({ tokens: -100, pricePerMillionInput: 2.5, pricePerMillionOutput: 10 });
    expect(res.costBrl).toBe(0);
    const gpt4o = estimateTokensCostBrl({ tokens: 1_000_000, pricePerMillionInput: 2.5, pricePerMillionOutput: 10 });
    expect(gpt4o.costBrl).toBeCloseTo(6.25 * USD_TO_BRL, 4);
  });

  it("permite câmbio customizado", () => {
    const res = estimateTokensCostBrl({ tokens: 1_000_000, pricePerMillionInput: 1, pricePerMillionOutput: 1, usdBrl: 1 });
    expect(res.costBrl).toBe(1);
  });
});

describe("(Rodada 39) catálogo de preços LLM (LLM_MODEL_PRICES)", () => {
  it("tem preços de entrada e saída coerentes para os modelos populares", () => {
    const entries = Object.entries(LLM_MODEL_PRICES);
    expect(entries.length).toBeGreaterThan(10);
    for (const [, price] of entries) {
      expect(price.input).toBeGreaterThan(0);
      expect(price.output).toBeGreaterThan(price.input);
    }
    expect(LLM_MODEL_PRICES["gpt-4.1-mini"]).toEqual({ input: 0.4, output: 1.6 });
    expect(LLM_MODEL_PRICES["openai/gpt-4o-mini"]).toEqual({ input: 0.15, output: 0.6 });
  });
});

