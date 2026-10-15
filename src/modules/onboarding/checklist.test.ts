import { describe, expect, it } from "vitest";
import { startChecklist } from "./checklist";

const none = { hasContact: false, papiConnected: false, hasQuote: false };

describe("startChecklist", () => {
  it("Lancer : contact, devis puis Papi", () => {
    expect(startChecklist("lancer", none).map((i) => i.key)).toEqual(["contact", "quote", "papi"]);
  });
  it("Remplir (et Grandir) : Papi d'abord", () => {
    expect(startChecklist("remplir", none).map((i) => i.key)).toEqual(["papi", "contact", "quote"]);
    expect(startChecklist("grandir", none).map((i) => i.key)).toEqual(["papi", "contact", "quote"]);
  });
  it("reflète l'état réel", () => {
    const items = startChecklist("lancer", { hasContact: true, papiConnected: false, hasQuote: true });
    expect(items.filter((i) => i.done).map((i) => i.key)).toEqual(["contact", "quote"]);
    expect(items.find((i) => i.key === "papi")?.href).toBe("/reglages/paiements");
  });
});
