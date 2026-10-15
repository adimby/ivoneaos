import { describe, expect, it } from "vitest";
import { computeTotals, inDefaultCurrency, parseQuantityInput, parseRateInput, quantityInputValue } from "./totals";

describe("computeTotals", () => {
  it("additionne les lignes et retire la remise, en unités mineures", () => {
    const totals = computeTotals(
      [
        { quantity: 1, unit_price: 400_000 },
        { quantity: 2.5, unit_price: 30_001 },
      ],
      50_000,
    );
    expect(totals.lineTotals).toEqual([400_000, 75_003]);
    expect(totals.subtotal).toBe(475_003);
    expect(totals.total).toBe(425_003);
    expect(totals.tooLarge).toBe(false);
  });

  it("arrondit chaque ligne comme la base (demi vers le haut, sans flottant)", () => {
    // 1,15 × 10 centimes = 11,5 → 12 ; 0,33 × 1 € (100 centimes) = 33
    expect(computeTotals([{ quantity: 1.15, unit_price: 10 }, { quantity: 0.33, unit_price: 100 }], 0).subtotal).toBe(45);
  });

  it("ne descend jamais sous zéro avec une remise plus grande que le sous-total", () => {
    expect(computeTotals([{ quantity: 1, unit_price: 1000 }], 5000).total).toBe(0);
  });

  it("signale un total au-delà du plafond de la base", () => {
    const totals = computeTotals(
      [
        { quantity: 1, unit_price: 600_000_000_000_000 },
        { quantity: 1, unit_price: 600_000_000_000_000 },
      ],
      0,
    );
    expect(totals.tooLarge).toBe(true);
  });
});

describe("saisie des quantités", () => {
  it("accepte la virgule ou le point, 2 décimales au plus", () => {
    expect(parseQuantityInput("1,5")).toEqual({ ok: true, value: 1.5, text: "1.5" });
    expect(parseQuantityInput(" 2 ")).toEqual({ ok: true, value: 2, text: "2" });
    expect(parseQuantityInput("0.25")).toEqual({ ok: true, value: 0.25, text: "0.25" });
  });

  it("refuse zéro, le négatif, 3 décimales et le texte", () => {
    for (const input of ["0", "-1", "1,005", "abc", "", "123456789"]) {
      expect(parseQuantityInput(input).ok, input).toBe(false);
    }
  });

  it("réécrit la quantité dans la langue du formulaire", () => {
    expect(quantityInputValue(1.5, "fr")).toBe("1,5");
    expect(quantityInputValue(1.5, "en")).toBe("1.5");
    expect(quantityInputValue(2, "fr")).toBe("2");
  });
});

describe("taux de change", () => {
  it("lit un taux saisi avec espaces et virgule", () => {
    expect(parseRateInput("5 000")).toBe(5000);
    expect(parseRateInput("4950,5")).toBe(4950.5);
    expect(parseRateInput("0")).toBeNull();
    expect(parseRateInput("1,1234567")).toBeNull();
  });

  it("convertit le total dans la devise par défaut", () => {
    // 361,50 € à 5 012,5 Ar l'euro = 1 812 018,75 → 1 812 019 Ar
    expect(inDefaultCurrency(36150, "EUR", "MGA", 5012.5)).toBe(1_812_019);
    expect(inDefaultCurrency(450_000, "MGA", "MGA", 1)).toBe(450_000);
  });

  it("ne convertit pas sans taux saisi", () => {
    expect(inDefaultCurrency(36150, "EUR", "MGA", 1)).toBeNull();
  });
});
