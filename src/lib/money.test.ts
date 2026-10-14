import { describe, expect, it } from "vitest";
import { convertMinor, formatMoney, lineTotal } from "./money";

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

describe("convertMinor", () => {
  it("convertit des centimes d'euro en ariary avec un taux par euro", () => {
    // 120,50 € à 5000 Ar l'euro = 602 500 Ar
    expect(convertMinor(12050, "EUR", "MGA", 5000)).toBe(602500);
  });

  it("convertit des ariary en centimes avec un taux par ariary", () => {
    // 450 000 Ar à 0,0002 € l'ariary = 90,00 €
    expect(convertMinor(450000, "MGA", "EUR", 0.0002)).toBe(9000);
  });

  it("arrondit à l'unité mineure", () => {
    // 0,01 € à 4950,5 Ar l'euro = 49,505 Ar → 50 Ar
    expect(convertMinor(1, "EUR", "MGA", 4950.5)).toBe(50);
  });

  it("garde le montant pour une même devise", () => {
    expect(convertMinor(9900, "USD", "USD", 1)).toBe(9900);
  });

  it("refuse un taux nul ou négatif", () => {
    expect(() => convertMinor(100, "EUR", "MGA", 0)).toThrow(RangeError);
    expect(() => convertMinor(100, "EUR", "MGA", -1)).toThrow(RangeError);
  });
});
