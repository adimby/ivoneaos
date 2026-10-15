import { describe, expect, it } from "vitest";
import { displayAmounts, summarizeDashboard, type InvoiceTotalRow, type StageRow } from "./summary";

const stages: StageRow[] = [
  { id: "s0", name: "prospect", kind: "open" },
  { id: "s1", name: "contacted", kind: "open" },
  { id: "s2", name: "call", kind: "open" },
  { id: "s3", name: "quote", kind: "open" },
  { id: "s4", name: "won", kind: "won" },
  { id: "s5", name: "lost", kind: "lost" },
];

const row = (r: Partial<InvoiceTotalRow>): InvoiceTotalRow => ({
  kind: "collected",
  currency: "MGA",
  exchange_rate: 1,
  overdue: false,
  item_count: 1,
  amount: 0,
  ...r,
});

describe("summarizeDashboard", () => {
  it("vide : zéros et toutes les étapes ouvertes", () => {
    const s = summarizeDashboard({ invoiceTotals: [], pipelineTotals: [], stages, defaultCurrency: "MGA" });
    expect(s.collected).toEqual({ amount: 0, count: 0, unconverted: [] });
    expect(s.pending).toEqual({ amount: 0, count: 0, overdueAmount: 0, overdueCount: 0, unconverted: [], overdueUnconverted: [] });
    expect(s.deals.map((d) => d.name)).toEqual(["prospect", "contacted", "call", "quote"]);
    expect(s.openDeals).toBe(0);
  });

  it("encaissé : converti dans la devise par défaut au taux de chaque facture", () => {
    const s = summarizeDashboard({
      invoiceTotals: [
        row({ currency: "MGA", amount: 450_000, item_count: 2 }),
        // 120,50 € à 5 000 Ar/€ = 602 500 Ar.
        row({ currency: "EUR", exchange_rate: 5000, amount: 12_050 }),
        // 10,00 $ à 4 500,5 Ar/$ = 45 005 Ar.
        row({ currency: "USD", exchange_rate: 4500.5, amount: 1_000 }),
      ],
      pipelineTotals: [],
      stages,
      defaultCurrency: "MGA",
    });
    expect(s.collected).toEqual({ amount: 450_000 + 602_500 + 45_005, count: 4, unconverted: [] });
  });

  it("devise par défaut en euros : ariary convertis en centimes", () => {
    // 50 000 Ar à 0,0002 €/Ar = 10,00 € = 1 000 centimes.
    const s = summarizeDashboard({
      invoiceTotals: [row({ currency: "MGA", exchange_rate: 0.0002, amount: 50_000 }), row({ currency: "EUR", amount: 2_500 })],
      pipelineTotals: [],
      stages,
      defaultCurrency: "EUR",
    });
    expect(s.collected.amount).toBe(3_500);
  });

  it("jamais de mélange silencieux : un montant sans taux reste dans sa devise", () => {
    const s = summarizeDashboard({
      invoiceTotals: [row({ currency: "MGA", amount: 100_000 }), row({ currency: "EUR", exchange_rate: 1, amount: 9_900 })],
      pipelineTotals: [],
      stages,
      defaultCurrency: "MGA",
    });
    expect(s.collected.amount).toBe(100_000);
    expect(s.collected.unconverted).toEqual([{ currency: "EUR", amount: 9_900 }]);
    expect(s.collected.count).toBe(2);
  });

  it("factures en attente : montant, nombre et retards", () => {
    const s = summarizeDashboard({
      invoiceTotals: [
        row({ kind: "pending", amount: 300_000, item_count: 2 }),
        row({ kind: "pending", amount: 150_000, overdue: true }),
        row({ kind: "pending", currency: "USD", exchange_rate: 4_000, amount: 5_000, overdue: true }),
      ],
      pipelineTotals: [],
      stages,
      defaultCurrency: "MGA",
    });
    expect(s.pending).toEqual({
      amount: 300_000 + 150_000 + 200_000,
      count: 4,
      overdueAmount: 150_000 + 200_000,
      overdueCount: 2,
      unconverted: [],
      overdueUnconverted: [],
    });
    expect(s.collected.count).toBe(0);
  });

  it("en attente sans taux, en retard compris : à part, dans leur devise", () => {
    const s = summarizeDashboard({
      invoiceTotals: [
        row({ kind: "pending", currency: "EUR", exchange_rate: 1, amount: 12_000, overdue: true }),
        row({ kind: "pending", currency: "USD", exchange_rate: 1, amount: 3_000 }),
      ],
      pipelineTotals: [],
      stages,
      defaultCurrency: "MGA",
    });
    expect(s.pending).toMatchObject({
      amount: 0,
      count: 2,
      overdueAmount: 0,
      overdueCount: 1,
      unconverted: [
        { currency: "EUR", amount: 12_000 },
        { currency: "USD", amount: 3_000 },
      ],
      overdueUnconverted: [{ currency: "EUR", amount: 12_000 }],
    });
  });

  it("opportunités ouvertes par étape : nombre et total par devise, sans conversion", () => {
    const s = summarizeDashboard({
      invoiceTotals: [],
      pipelineTotals: [
        { stage_id: "s0", currency: "EUR", deal_count: 1, amount_sum: 50_000 },
        { stage_id: "s0", currency: "MGA", deal_count: 2, amount_sum: 900_000 },
        { stage_id: "s2", currency: "MGA", deal_count: 1, amount_sum: null },
        // Gagné et perdu : hors du bloc.
        { stage_id: "s4", currency: "MGA", deal_count: 5, amount_sum: 5_000_000 },
      ],
      stages,
      defaultCurrency: "MGA",
    });
    expect(s.deals).toEqual([
      { stageId: "s0", name: "prospect", count: 3, amounts: [{ currency: "MGA", amount: 900_000 }, { currency: "EUR", amount: 50_000 }] },
      { stageId: "s1", name: "contacted", count: 0, amounts: [] },
      { stageId: "s2", name: "call", count: 1, amounts: [] },
      { stageId: "s3", name: "quote", count: 0, amounts: [] },
    ]);
    expect(s.openDeals).toBe(4);
  });
});

describe("displayAmounts", () => {
  it("montant converti en chiffre principal, montants sans taux à part", () => {
    expect(displayAmounts(450_000, "MGA", [{ currency: "EUR", amount: 12_000 }])).toEqual({
      main: [{ currency: "MGA", amount: 450_000 }],
      extra: [{ currency: "EUR", amount: 12_000 }],
    });
  });

  it("rien de converti : les montants sans taux deviennent le chiffre principal (pas de « 0 Ar »)", () => {
    expect(displayAmounts(0, "MGA", [{ currency: "EUR", amount: 12_000 }])).toEqual({
      main: [{ currency: "EUR", amount: 12_000 }],
      extra: [],
    });
  });

  it("tout à zéro : zéro dans la devise par défaut", () => {
    expect(displayAmounts(0, "MGA", [])).toEqual({ main: [{ currency: "MGA", amount: 0 }], extra: [] });
  });
});
