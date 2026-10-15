import { describe, expect, it } from "vitest";
import { composeManualInstructions, parseManualInstructions } from "./manual-instructions";

describe("coordonnées de paiement direct", () => {
  it("compose une ligne par moyen", () => {
    expect(composeManualInstructions({ mvola: "0341234567", rib: "00005000011234567890123" })).toBe(
      "MVola : 034 12 345 67\nRIB : 00005000011234567890123",
    );
    expect(composeManualInstructions({ mvola: "", rib: "" })).toBeNull();
  });

  it("relit ce qu'elle a composé", () => {
    const text = composeManualInstructions({ mvola: "0381234567", rib: "" });
    expect(parseManualInstructions(text)).toEqual({ mvola: "0381234567", rib: "" });
    expect(parseManualInstructions(null)).toEqual({ mvola: "", rib: "" });
  });
});
