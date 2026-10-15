import { describe, expect, it } from "vitest";
import { parseWith } from "@/lib/forms";
import { diagnosticSchema } from "./diagnostic-schema";

describe("diagnosticSchema", () => {
  it("accepte des nombres saisis avec des espaces", () => {
    expect(
      parseWith(diagnosticSchema, { experience: "lt1", current_clients: "0", monthly_income_goal: "1 500 000" }),
    ).toEqual({ ok: true, data: { experience: "lt1", current_clients: 0, monthly_income_goal: 1_500_000 } });
  });

  it("exige chaque réponse", () => {
    const result = parseWith(diagnosticSchema, { experience: "", current_clients: "", monthly_income_goal: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual({
        experience: "invalid_choice",
        current_clients: "required",
        monthly_income_goal: "required",
      });
    }
  });

  it("refuse décimales, négatifs et valeurs démesurées", () => {
    const result = parseWith(diagnosticSchema, {
      experience: "gt3",
      current_clients: "-2",
      monthly_income_goal: "1500000,50",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual({ current_clients: "invalid_number", monthly_income_goal: "invalid_number" });
    }
    const huge = parseWith(diagnosticSchema, { experience: "gt3", current_clients: "100001", monthly_income_goal: "1" });
    expect(!huge.ok && huge.fieldErrors).toEqual({ current_clients: "too_large" });
  });
});
