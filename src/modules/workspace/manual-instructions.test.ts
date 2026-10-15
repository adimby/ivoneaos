import { describe, expect, it } from "vitest";
import { composeManualInstructions, parseManualInstructions } from "./manual-instructions";

describe("coordonnées de paiement direct", () => {
  it("compose une ligne par moyen", () => {
    expect(composeManualInstructions({ mvola: "0341234567", rib: "00005000011234567890123", other: "" })).toBe(
      "MVola : 034 12 345 67\nRIB : 00005000011234567890123",
    );
    expect(composeManualInstructions({ mvola: "", rib: "", other: " " })).toBeNull();
  });

  it("relit ce qu'elle a composé", () => {
    const text = composeManualInstructions({ mvola: "0381234567", rib: "", other: "" });
    expect(parseManualInstructions(text)).toEqual({ mvola: "0381234567", rib: "", other: "" });
    expect(parseManualInstructions(null)).toEqual({ mvola: "", rib: "", other: "" });
  });

  it("garde une ligne libre pour les clients à l'étranger (IBAN, PayPal…)", () => {
    const other = "IBAN FR76 3000 6000 0112 3456 7890 189, BIC AGRIFRPP";
    const text = composeManualInstructions({ mvola: "", rib: "00005000011234567890123", other });
    expect(text).toBe(`RIB : 00005000011234567890123\n${other}`);
    expect(parseManualInstructions(text)).toEqual({ mvola: "", rib: "00005000011234567890123", other });
  });
});
