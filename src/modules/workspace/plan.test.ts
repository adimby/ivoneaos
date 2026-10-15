import { describe, expect, it } from "vitest";
import { canUse, PLAN_LIMITS, PLANS, planMeters } from "./plan";

describe("canUse", () => {
  const usage = (activeContacts: number, documentsThisMonth: number) => ({ activeContacts, documentsThisMonth });

  it("Découverte : 20 contacts actifs au plus", () => {
    expect(canUse({ plan: "decouverte" }, "create_contact", usage(19, 0))).toBe(true);
    expect(canUse({ plan: "decouverte" }, "create_contact", usage(20, 0))).toBe(false);
    expect(canUse({ plan: "decouverte" }, "create_contact", usage(25, 0))).toBe(false);
  });

  it("Découverte : 3 devis ou factures envoyés par mois", () => {
    expect(canUse({ plan: "decouverte" }, "send_document", usage(0, 2))).toBe(true);
    expect(canUse({ plan: "decouverte" }, "send_document", usage(0, 3))).toBe(false);
  });

  it("Lancement et au-dessus : illimité", () => {
    for (const plan of PLANS.filter((p) => p !== "decouverte")) {
      expect(canUse({ plan }, "create_contact", usage(10_000, 0))).toBe(true);
      expect(canUse({ plan }, "send_document", usage(0, 10_000))).toBe(true);
    }
  });

  it("mêmes valeurs que la base (contacts_plan_limit, next_document_number)", () => {
    expect(PLAN_LIMITS.decouverte).toEqual({ activeContacts: 20, documentsPerMonth: 3 });
  });
});

describe("planMeters", () => {
  it("usage et limite atteinte", () => {
    expect(planMeters("decouverte", { activeContacts: 20, documentsThisMonth: 1 })).toEqual([
      { key: "contacts", used: 20, limit: 20, reached: true },
      { key: "documents", used: 1, limit: 3, reached: false },
    ]);
    expect(planMeters("lancement", { activeContacts: 50, documentsThisMonth: 9 })).toEqual([
      { key: "contacts", used: 50, limit: null, reached: false },
      { key: "documents", used: 9, limit: null, reached: false },
    ]);
  });
});
