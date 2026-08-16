import { describe, expect, it } from "vitest";

/**
 * Testa a lógica de ordenação do Kanban por tempo no status atual.
 *
 * A ordenação é feita pelo campo statusChangedAt (momento em que a ideia
 * entrou no status atual), com fallback para createdAt quando o campo
 * está ausente — reproduzindo a mesma chave de ordenação usada na UI
 * (IdeaHistory.tsx, `columnSortKey`).
 */

type PinnedIdea = {
  id: number;
  status: string;
  statusChangedAt: Date | null;
  createdAt: Date;
};

export function kanbanSortKey(p: PinnedIdea): number {
  return new Date(p.statusChangedAt ?? p.createdAt).getTime();
}

describe("kanbanSortKey", () => {
  it("usa statusChangedAt quando presente", () => {
    const changed = new Date("2026-08-01T00:00:00Z");
    const created = new Date("2026-08-10T00:00:00Z");
    expect(kanbanSortKey({ id: 1, status: "gravando", statusChangedAt: changed, createdAt: created })).toBe(
      changed.getTime()
    );
  });

  it("recua para createdAt quando statusChangedAt é nulo", () => {
    const created = new Date("2026-08-10T00:00:00Z");
    expect(kanbanSortKey({ id: 2, status: "planejada", statusChangedAt: null, createdAt: created })).toBe(
      created.getTime()
    );
  });

  it("ordena a coluna com as mais antigas no topo", () => {
    const now = Date.now();
    const ideas: PinnedIdea[] = [
      { id: 1, status: "gravando", statusChangedAt: new Date(now - 1e3), createdAt: new Date(now - 1e3) },
      { id: 2, status: "gravando", statusChangedAt: new Date(now - 9e3), createdAt: new Date(now - 9e3) },
      { id: 3, status: "gravando", statusChangedAt: new Date(now - 5e3), createdAt: new Date(now - 5e3) },
    ];
    const sorted = [...ideas].sort((a, b) => kanbanSortKey(a) - kanbanSortKey(b));
    expect(sorted.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("trata statusChangedAt ausente (undefined) como createdAt", () => {
    const created = new Date("2026-07-30T00:00:00Z");
    const p: PinnedIdea = { id: 4, status: "gravando", statusChangedAt: undefined as never, createdAt: created };
    expect(kanbanSortKey(p)).toBe(created.getTime());
  });
});
