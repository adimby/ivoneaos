import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("garde un chemin interne, sans la langue", () => {
    expect(safeNextPath("/fr/reglages")).toBe("/reglages");
    expect(safeNextPath("/en/factures?statut=sent")).toBe("/factures?statut=sent");
    expect(safeNextPath("/pipeline")).toBe("/pipeline");
  });
  it("refuse une autre origine", () => {
    expect(safeNextPath("https://exemple.com")).toBeNull();
    expect(safeNextPath("//exemple.com")).toBeNull();
    expect(safeNextPath("/\\exemple.com")).toBeNull();
    expect(safeNextPath("/fr//exemple.com")).toBeNull();
  });
  it("ignore une valeur vide, la racine ou la page de connexion", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("/fr")).toBeNull();
    expect(safeNextPath("/fr/connexion")).toBeNull();
  });
});
