export type SortablePinnedIdea = {
  id: number;
  status: string;
  /** Momento em que a ideia entrou no status atual */
  statusChangedAt: Date | null | undefined;
  /** Data de criação (fallback quando statusChangedAt está ausente) */
  createdAt: Date;
};

/**
 * Chave de ordenação das colunas do Kanban pelo tempo no status atual.
 * Usa statusChangedAt quando presente; recua para createdAt quando ausente.
 */
export function kanbanSortKey(p: SortablePinnedIdea): number {
  return new Date((p.statusChangedAt ?? p.createdAt) as Date).getTime();
}

/**
 * Ordena uma coluna de ideias: as que estão no status atual há mais tempo
 * aparecem primeiro (mais antigas no topo).
 */
export function sortColumnOldestFirst<T extends SortablePinnedIdea>(pinned: T[]): T[] {
  return [...pinned].sort((a, b) => kanbanSortKey(a) - kanbanSortKey(b));
}

/**
 * Provedor do storage de sessão. Permite substituir o acesso em testes
 * (ex.: `sessionStorage.getStorage = () => inMemory`) sem mock de módulo.
 */
export const sessionStorage = {
  getStorage(): Storage | null {
    try {
      return typeof window !== "undefined" ? window.sessionStorage : null;
    } catch {
      return null;
    }
  },
};

/** Chave usada no sessionStorage para persistir a preferência de ordenação */
export const KANBAN_OLDEST_FIRST_KEY = "vyroscope-kanban-oldest-first";

/** Chave usada no sessionStorage para persistir o filtro de publicadas ocultas */
export const KANBAN_HIDE_PUBLISHED_KEY = "vyroscope-kanban-hide-published";

/**
 * Lê uma preferência booleana da sessionStorage, com fallback em memória
 * para ambientes onde o armazenamento está indisponível (modo privado).
 */
export function readSessionFlag(key: string, fallback: boolean): boolean {
  try {
    const storage = sessionStorage.getStorage();
    return storage ? storage.getItem(key) === "1" : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persiste uma preferência booleana na sessionStorage (session-only).
 */
export function writeSessionFlag(key: string, value: boolean) {
  try {
    const storage = sessionStorage.getStorage();
    if (storage) {
      storage.setItem(key, value ? "1" : "0");
    }
  } catch {
    // sessionStorage indisponível (privado/incógnito): segue só em memória
  }
}
