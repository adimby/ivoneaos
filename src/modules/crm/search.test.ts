import { describe, expect, it } from "vitest";
import { containsPattern, searchTerm } from "./search";

describe("recherche des contacts", () => {
  it("garde parenthèses, virgules et apostrophes, entre guillemets", () => {
    expect(containsPattern("Rasoa (Soa), O'Brien")).toBe(`"*Rasoa (Soa), O'Brien*"`);
  });
  it("échappe les jokers SQL % et _", () => {
    expect(containsPattern("Atelier_Bleu 50%")).toBe(String.raw`"*Atelier\\_Bleu 50\\%*"`);
  });
  it("échappe guillemets et barres obliques inverses", () => {
    expect(containsPattern('a"b')).toBe(String.raw`"*a\"b*"`);
    expect(containsPattern("a\\b")).toBe(String.raw`"*a\\\\b*"`);
  });
  it("retire le joker * et réduit les espaces", () => {
    expect(searchTerm("  Ra*soa   (Soa) ")).toBe("Ra soa (Soa)");
    expect(searchTerm("x".repeat(150))).toHaveLength(100);
  });
});
