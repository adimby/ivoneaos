import { describe, expect, it } from "vitest";
import { startChecklist } from "./checklist";

const none = { hasContact: false, papiConnected: false, hasQuote: false, hasFiscalInfo: false };

describe("startChecklist", () => {
  it("Lancer : contact, devis, infos fiscales puis Papi", () => {
    expect(startChecklist("lancer", none).map((i) => i.key)).toEqual(["contact", "quote", "fiscal", "papi"]);
  });
  it("Remplir (et Grandir) : Papi et infos fiscales d'abord", () => {
    expect(startChecklist("remplir", none).map((i) => i.key)).toEqual(["papi", "fiscal", "contact", "quote"]);
    expect(startChecklist("grandir", none).map((i) => i.key)).toEqual(["papi", "fiscal", "contact", "quote"]);
  });
  it("reflète l'état réel", () => {
    const items = startChecklist("lancer", { hasContact: true, papiConnected: false, hasQuote: true, hasFiscalInfo: true });
    expect(items.filter((i) => i.done).map((i) => i.key)).toEqual(["contact", "quote", "fiscal"]);
    expect(items.find((i) => i.key === "papi")?.href).toBe("/reglages/paiements");
    expect(items.find((i) => i.key === "fiscal")?.href).toBe("/reglages#infos-fiscales");
  });
});
