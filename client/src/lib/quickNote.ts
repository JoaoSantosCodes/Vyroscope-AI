/**
 * Lógica de validação da edição rápida de notas do Kanban.
 * Testável de forma independente do React/Redux.
 */

/** Valor normalizado de uma anotação: trim + colapso de vazios. */
export function normalizeNote(notes: string | null | undefined): string {
  return (notes ?? "").trim();
}

/**
 * Decide se a edição rápida deve disparar a mutation.
 * Retorna true quando o texto alterado é diferente do valor persistido.
 * Casos:
 * - texto igual ao persistido → não faz nada (fechar modal sem mutation)
 * - texto vazio equivale a notas null/"" → mesma regra
 */
export function shouldSaveQuickNote(draft: string, persisted: string | null | undefined): boolean {
  return normalizeNote(draft) !== normalizeNote(persisted);
}

/** Valor a enviar ao backend: string vazia vira null para apagar a anotação. */
export function quickNoteValue(draft: string): string | null {
  const v = normalizeNote(draft);
  return v === "" ? null : v;
}
