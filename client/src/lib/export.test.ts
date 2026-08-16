import { describe, expect, it } from "vitest";
import { buildFavoritesCsv, buildIdeaHistoryCsv } from "./export";

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

describe("buildIdeaHistoryCsv", () => {
  it("emits pinned rows first, then history rows, with notes and status columns", () => {
    const pinned = [{ date: "2026-08-14", niche: "fitness", suggestionTitle: "Ideia fixada", viralityScore: 85, notes: "Rascunho: começar com hook", status: "gravando" }];
    const ideas = [
      {
        date: "2026-08-13",
        niche: "fitness",
        suggestion: { title: "Ideia rotacionada", hook: "Hook 1", angle: "Ângulo 1", viralityScore: 70 },
      },
    ];

    const csv = buildIdeaHistoryCsv(pinned, ideas);

    expect(csv[0]).toContain("Seção,Data,Nicho,Score,Título,Hook,Ângulo,Anotações");
    expect(csv).toHaveLength(3);
    expect(csv[1]).toContain("\"Fixada\"");
    expect(csv[1]).toContain("\"Ideia fixada\"");
    expect(csv[1]).toContain("\"Rascunho: começar com hook\"");
    expect(csv[1]).toContain("\"Gravando\"");
    expect(csv[2]).toContain("\"Histórico\"");
    expect(csv[2]).toContain("\"Ideia rotacionada\"");
    expect(csv[2]).toContain("\"Hook 1\"");
  });

  it("escapes quotes and keeps null notes empty", () => {
    const csv = buildIdeaHistoryCsv(
      [{ date: "2026-08-14", niche: "financeiro", suggestionTitle: 'Ideia com "aspas"', viralityScore: 60, notes: null, status: "planejada" }],
      []
    );
    expect(csv[1]).toContain('"Ideia com ""aspas"""');
    expect(csv[1]).toContain("60");
    // notes null vira vazio; status conhecido vem como rótulo antes do fechamento
    expect(csv[1]).toContain('"Planejada"');
    expect(csv[1]).toMatch(/Planejada"$/);
  });

  it("works with empty inputs, returning only the header", () => {
    expect(buildIdeaHistoryCsv([], [])).toEqual(["Seção,Data,Nicho,Score,Título,Hook,Ângulo,Anotações,Status"]);
  });

  it("maps status values to pt-BR labels and defaults unknown to Planejada", () => {
    const csv = buildIdeaHistoryCsv(
      [
        { date: "2026-08-14", niche: "fitness", suggestionTitle: "A", viralityScore: 80, notes: null, status: "planejada" },
        { date: "2026-08-13", niche: "fitness", suggestionTitle: "B", viralityScore: 70, notes: null, status: "publicada" },
        { date: "2026-08-12", niche: "fitness", suggestionTitle: "C", viralityScore: 60, notes: null, status: "outro" },
        { date: "2026-08-11", niche: "fitness", suggestionTitle: "D", viralityScore: 50, notes: null },
      ],
      []
    );
    expect(csv[1]).toContain("\"Planejada\"");
    expect(csv[2]).toContain("\"Publicada\"");
    expect(csv[3]).toContain("\"Planejada\""); // status desconhecido cai no default
    expect(csv[4]).toContain("\"Planejada\""); // status ausente cai no default
  });

  it("appends archived rows in a dedicated section with status and notes", () => {
    const pinned = [{ date: "2026-08-14", niche: "fitness", suggestionTitle: "Ativa", viralityScore: 85, notes: null, status: "gravando" }];
    const archived = [
      { date: "2026-08-10", niche: "fitness", suggestionTitle: "Pub-1", viralityScore: 90, notes: "Ótima performance", status: "publicada" },
      { date: "2026-08-05", niche: "fitness", suggestionTitle: "Pub-2", viralityScore: 70, notes: null, status: "publicada" },
    ];
    const csv = buildIdeaHistoryCsv(pinned, [], archived);
    // Fixada + 2 Arquivadas (sem histórico)
    expect(csv).toHaveLength(4);
    expect(csv[0]).toContain("Status");
    expect(csv[1]).toContain("\"Fixada\"");
    expect(csv[2]).toContain("\"Arquivada\"");
    expect(csv[2]).toContain("\"Pub-1\"");
    expect(csv[2]).toContain("\"Publicada\"");
    expect(csv[2]).toContain("\"Ótima performance\"");
    expect(csv[3]).toContain("\"Pub-2\"");
    expect(csv[3]).toContain("\"Publicada\"");
    expect(csv[3]).toContain('""'); // anotação nula vira campo vazio
  });

  it("omits the archived section when the list is not provided", () => {
    const csvWith = buildIdeaHistoryCsv(
      [{ date: "2026-08-14", niche: "fitness", suggestionTitle: "A", viralityScore: 80, notes: null, status: "planejada" }],
      [],
      [{ date: "2026-08-10", niche: "fitness", suggestionTitle: "Arq", viralityScore: 70, notes: null, status: "publicada" }]
    );
    const csvWithout = buildIdeaHistoryCsv(
      [{ date: "2026-08-14", niche: "fitness", suggestionTitle: "A", viralityScore: 80, notes: null, status: "planejada" }],
      []
    );
    expect(csvWithout).toHaveLength(2);
    expect(csvWith).toHaveLength(3);
    expect(csvWith[2]).toContain("\"Arquivada\"");
  });
});
