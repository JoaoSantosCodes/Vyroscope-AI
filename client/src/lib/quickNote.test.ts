import { describe, expect, it } from "vitest";
import { normalizeNote, quickNoteValue, shouldSaveQuickNote } from "./quickNote";

describe("normalizeNote", () => {
  it("normaliza null/undefined e espaços", () => {
    expect(normalizeNote(null)).toBe("");
    expect(normalizeNote(undefined)).toBe("");
    expect(normalizeNote("   ")).toBe("");
  });

  it("mantém o texto com trim", () => {
    expect(normalizeNote("  rascunho  ")).toBe("rascunho");
  });
});

describe("shouldSaveQuickNote", () => {
  it("não salva quando o texto é igual ao persistido", () => {
    expect(shouldSaveQuickNote("gravar intro", "gravar intro")).toBe(false);
  });

  it("não salva quando os dois são vazios (casos equivalentes)", () => {
    expect(shouldSaveQuickNote("", null)).toBe(false);
    expect(shouldSaveQuickNote("", "")).toBe(false);
    expect(shouldSaveQuickNote("   ", null)).toBe(false);
  });

  it("salva quando o texto mudou", () => {
    expect(shouldSaveQuickNote("gravar intro", "rascunho antigo")).toBe(true);
    expect(shouldSaveQuickNote("novo texto", null)).toBe(true);
  });

  it("salva quando o texto existente foi apagado", () => {
    expect(shouldSaveQuickNote("", "rascunho antigo")).toBe(true);
  });
});

describe("quickNoteValue", () => {
  it("envia null para apagar a anotação", () => {
    expect(quickNoteValue("   ")).toBeNull();
    expect(quickNoteValue("")).toBeNull();
  });

  it("envia o texto limpo", () => {
    expect(quickNoteValue("  gravar intro  ")).toBe("gravar intro");
  });
});
