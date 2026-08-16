import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KANBAN_OLDEST_FIRST_KEY, kanbanSortKey, readSessionFlag, sessionStorage as sessionFlagStorage, sortColumnOldestFirst, writeSessionFlag } from "./kanbanSort";

let store: Record<string, string> = {};
function makeStorage(): Storage {
  const s: Partial<Storage> = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
  return s as Storage;
}

const originalGetStorage = sessionFlagStorage.getStorage;
beforeEach(() => {
  store = {};
  sessionFlagStorage.getStorage = () => makeStorage();
});
afterEach(() => {
  sessionFlagStorage.getStorage = originalGetStorage;
});

type PinnedIdea = {
  id: number;
  status: string;
  statusChangedAt: Date | null;
  createdAt: Date;
};

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

  it("trata statusChangedAt ausente (undefined) como createdAt", () => {
    const created = new Date("2026-07-30T00:00:00Z");
    expect(kanbanSortKey({ id: 4, status: "gravando", statusChangedAt: undefined, createdAt: created })).toBe(
      created.getTime()
    );
  });
});

describe("sortColumnOldestFirst", () => {
  it("ordena a coluna com as mais antigas no status atual no topo", () => {
    const now = Date.now();
    const ideas: PinnedIdea[] = [
      { id: 1, status: "gravando", statusChangedAt: new Date(now - 1e3), createdAt: new Date(now - 1e3) },
      { id: 2, status: "gravando", statusChangedAt: new Date(now - 9e3), createdAt: new Date(now - 9e3) },
      { id: 3, status: "gravando", statusChangedAt: new Date(now - 5e3), createdAt: new Date(now - 5e3) },
    ];
    expect(sortColumnOldestFirst(ideas).map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("não muta o array original", () => {
    const now = Date.now();
    const ideas: PinnedIdea[] = [
      { id: 1, status: "planejada", statusChangedAt: new Date(now - 1e3), createdAt: new Date(now - 1e3) },
      { id: 2, status: "planejada", statusChangedAt: new Date(now - 9e3), createdAt: new Date(now - 9e3) },
    ];
    sortColumnOldestFirst(ideas);
    expect(ideas.map((p) => p.id)).toEqual([1, 2]);
  });

  it("mistura statusChangedAt ausente e presente corretamente", () => {
    const now = Date.now();
    const ideas: PinnedIdea[] = [
      { id: 1, status: "publicada", statusChangedAt: new Date(now - 2e3), createdAt: new Date(now - 2e3) },
      { id: 2, status: "publicada", statusChangedAt: null, createdAt: new Date(now - 9e3) },
    ];
    // id 2 nasceu há 9s e nunca mudou de status: é o mais antigo na coluna
    expect(sortColumnOldestFirst(ideas).map((p) => p.id)).toEqual([2, 1]);
  });
});

describe("readSessionFlag / writeSessionFlag", () => {
  it("lê true quando o valor '1' está gravado", () => {
    writeSessionFlag(KANBAN_OLDEST_FIRST_KEY, true);
    expect(readSessionFlag(KANBAN_OLDEST_FIRST_KEY, false)).toBe(true);
  });

  it("retorna o fallback quando nada está gravado", () => {
    expect(readSessionFlag(KANBAN_OLDEST_FIRST_KEY, false)).toBe(false);
    writeSessionFlag(KANBAN_OLDEST_FIRST_KEY, true);
    expect(readSessionFlag(KANBAN_OLDEST_FIRST_KEY, false)).toBe(true);
    expect(readSessionFlag(KANBAN_OLDEST_FIRST_KEY, true)).toBe(true);
  });

  it("grava '1' ou '0' conforme o valor", () => {
    writeSessionFlag(KANBAN_OLDEST_FIRST_KEY, true);
    expect(store[KANBAN_OLDEST_FIRST_KEY]).toBe("1");
    writeSessionFlag(KANBAN_OLDEST_FIRST_KEY, false);
    expect(store[KANBAN_OLDEST_FIRST_KEY]).toBe("0");
  });

  it("não lança quando o storage está indisponível", () => {
    sessionFlagStorage.getStorage = () => null;
    expect(() => writeSessionFlag(KANBAN_OLDEST_FIRST_KEY, true)).not.toThrow();
    expect(readSessionFlag(KANBAN_OLDEST_FIRST_KEY, false)).toBe(false);
  });
});
