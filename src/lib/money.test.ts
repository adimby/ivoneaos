import { describe, expect, it } from "vitest";
import { formatMoney, lineTotal } from "./money";

// Intl utilise des espaces insécables comme séparateurs de milliers.
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("affiche l'ariary sans décimales, suivi de Ar", () => {
    expect(plain(formatMoney(450000, "MGA"))).toBe("450 000 Ar");
  });

  it("affiche les euros à partir des centimes", () => {
    expect(plain(formatMoney(120050, "EUR"))).toBe("1 200,50 €");
  });

  it("affiche les dollars en anglais", () => {
    expect(formatMoney(99, "USD", "en")).toBe("$0.99");
  });

  it("refuse un montant non entier", () => {
    expect(() => formatMoney(10.5, "MGA")).toThrow(RangeError);
  });
});

describe("lineTotal", () => {
  it("multiplie quantité et prix unitaire en arrondissant", () => {
    expect(lineTotal(2, 50000)).toBe(100000);
    expect(lineTotal(1.5, 333)).toBe(500);
  });
});
