import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { diagnosticDefaults } = await import("./queries");

describe("reprise du diagnostic", () => {
  it("reprend les réponses enregistrées, au format de saisie", () => {
    expect(diagnosticDefaults({ trade: "Graphiste", experience: "1to3", current_clients: 2, monthly_income_goal: 1500000 })).toEqual({
      experience: "1to3",
      current_clients: "2",
      monthly_income_goal: "1 500 000",
    });
  });
  it("ignore une réponse absente ou inattendue", () => {
    expect(diagnosticDefaults(null)).toEqual({ experience: "", current_clients: "", monthly_income_goal: "" });
    expect(diagnosticDefaults({ experience: "x", current_clients: -1, monthly_income_goal: "beaucoup" })).toEqual({
      experience: "",
      current_clients: "",
      monthly_income_goal: "",
    });
  });
});
