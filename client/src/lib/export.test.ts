import { describe, expect, it } from "vitest";
import { buildFavoritesCsv } from "./export";

function thumb(
  title: string,
  niche: string,
  opts: { sortOrder?: number; createdAt?: Date; imageUrl?: string } = {}
) {
  return {
    id: 1,
    imageUrl: opts.imageUrl ?? "https://exemplo.com/thumb.png",
    suggestionTitle: title,
    niche,
    sortOrder: opts.sortOrder ?? null,
    createdAt: opts.createdAt ?? new Date("2026-08-15T00:00:00Z"),
  };
}

describe("buildFavoritesCsv", () => {
  it("emits the header followed by one row per thumbnail grouped by folder", () => {
    const rows = [
      { folder: { id: null, name: "Galeria" }, thumbnails: [thumb("Vídeo A", "fitness"), thumb("Vídeo B", "fitness", { sortOrder: 2 })] },
      { folder: { id: 7, name: "Campanha" }, thumbnails: [thumb("Vídeo C", "moda", { sortOrder: 1 })] },
    ];

    const csv = buildFavoritesCsv(rows);

    expect(csv[0]).toBe("Pasta,Ordem,Título sugerido,Nicho,Data adicionada,URL da imagem");
    expect(csv).toHaveLength(4);
    expect(csv[1]).toContain("\"Galeria\"");
    expect(csv[1]).toContain("\"Vídeo A\"");
    expect(csv[2]).toContain("\"2\"");
    expect(csv[3]).toContain("\"Campanha\"");
    expect(csv[3]).toContain("\"Vídeo C\"");
  });

  it("falls back to Galeria (sem pasta) when the folder name is null", () => {
    const rows = [{ folder: { id: null, name: null }, thumbnails: [thumb("X", "IA")] }];
    expect(buildFavoritesCsv(rows)[1]).toContain("\"Galeria (sem pasta)\"");
  });

  it("escapes commas and quotes inside suggestion titles", () => {
    const rows = [{ folder: { id: null, name: "P" }, thumbnails: [thumb('Título, com "aspas"', "IA")] }];
    expect(buildFavoritesCsv(rows)[1]).toBe('\"P\",\"\",\"Título, com \"\"aspas\"\"\",\"IA\",\"15/08/2026\",\"https://exemplo.com/thumb.png\"');
  });

  it("formats the added date in pt-BR", () => {
    const rows = [{ folder: { id: null, name: "P" }, thumbnails: [thumb("T", "IA", { createdAt: new Date("2026-01-03T12:00:00Z") })] }];
    expect(buildFavoritesCsv(rows)[1]).toContain("\"03/01/2026\"");
  });

  it("works with empty folders list", () => {
    expect(buildFavoritesCsv([])).toEqual(["Pasta,Ordem,Título sugerido,Nicho,Data adicionada,URL da imagem"]);
  });
});
