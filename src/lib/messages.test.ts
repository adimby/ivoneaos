import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Toute clé existe dans les deux langues (aucun texte manquant en anglais ou en français).
function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("traductions", () => {
  it("fr et en ont exactement les mêmes clés", () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });
  it("aucun texte vide", () => {
    for (const messages of [fr, en]) {
      for (const key of keys(messages)) {
        const text = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
        expect(String(text).trim(), key).not.toBe("");
      }
    }
  });
});
