import { describe, expect, it } from "vitest";
import { applyMove, stageSummary, type BoardState } from "./pipeline-move";

const state: BoardState = {
  deals: [
    { id: "a", stage_id: "prospect", currency: "MGA", amount: 450000 },
    { id: "b", stage_id: "prospect", currency: "MGA", amount: 100000 },
    { id: "c", stage_id: "contacted", currency: "EUR", amount: 120000 },
    { id: "d", stage_id: "prospect", currency: "MGA", amount: null },
  ],
  totals: [
    { stage_id: "prospect", currency: "MGA", deal_count: 3, amount_sum: 550000 },
    { stage_id: "contacted", currency: "EUR", deal_count: 1, amount_sum: 120000 },
  ],
};

describe("applyMove", () => {
  it("déplace l'opportunité en tête de sa nouvelle étape et ajuste nombres et totaux", () => {
    const next = applyMove(state, "a", "contacted");
    expect(next.deals[0]).toEqual({ id: "a", stage_id: "contacted", currency: "MGA", amount: 450000 });
    expect(next.deals).toHaveLength(4);
    expect(stageSummary(next.totals, "prospect", "fr")).toEqual({ count: 2, total: "100 000 Ar" });
    const contacted = stageSummary(next.totals, "contacted", "fr");
    expect(contacted.count).toBe(2);
    expect(contacted.total).toMatch(/^450\s000 Ar · 1\s200,00\s€$/);
  });

  it("ajoute à une ligne existante de même devise", () => {
    const next = applyMove(applyMove(state, "a", "call"), "b", "call");
    expect(stageSummary(next.totals, "call", "fr")).toEqual({ count: 2, total: "550 000 Ar" });
    expect(stageSummary(next.totals, "prospect", "fr")).toEqual({ count: 1, total: null });
  });

  it("sans montant : le nombre change, pas le total", () => {
    const next = applyMove(state, "d", "won");
    expect(stageSummary(next.totals, "prospect", "fr")).toEqual({ count: 2, total: "550 000 Ar" });
    expect(stageSummary(next.totals, "won", "fr")).toEqual({ count: 1, total: null });
  });

  it("total à 0 : gardé s'il reste une carte de cette devise avec un montant, comme en base", () => {
    const zero: BoardState = {
      deals: [
        { id: "a", stage_id: "prospect", currency: "MGA", amount: 450000 },
        { id: "z", stage_id: "prospect", currency: "MGA", amount: 0 },
        { id: "n", stage_id: "call", currency: "MGA", amount: 300000 },
        { id: "m", stage_id: "call", currency: "MGA", amount: null },
      ],
      totals: [
        { stage_id: "prospect", currency: "MGA", deal_count: 2, amount_sum: 450000 },
        { stage_id: "call", currency: "MGA", deal_count: 2, amount_sum: 300000 },
      ],
    };
    // Reste « z » (0 Ar) : total 0 Ar, pas de total disparu.
    expect(stageSummary(applyMove(zero, "a", "won").totals, "prospect", "fr")).toEqual({ count: 1, total: "0 Ar" });
    // Reste « m », sans montant : plus de total.
    expect(stageSummary(applyMove(zero, "n", "won").totals, "call", "fr")).toEqual({ count: 1, total: null });
  });

  it("dernière opportunité de l'étape : nombre à 0 et plus de total", () => {
    const next = applyMove(state, "c", "prospect");
    expect(stageSummary(next.totals, "contacted", "fr")).toEqual({ count: 0, total: null });
    expect(stageSummary(next.totals, "prospect", "fr").count).toBe(4);
  });

  it("même étape ou opportunité inconnue : rien ne change", () => {
    expect(applyMove(state, "a", "prospect")).toBe(state);
    expect(applyMove(state, "zzz", "won")).toBe(state);
  });
});
