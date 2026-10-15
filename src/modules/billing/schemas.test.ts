import { describe, expect, it } from "vitest";
import { parseDocumentForm, type DocumentFormInput } from "./schemas";

const CONTACT = "6f1c2b8e-1d2a-4c3b-9e4f-5a6b7c8d9e0f";
const base: DocumentFormInput = {
  kind: "quote",
  contact_id: CONTACT,
  deal_id: "",
  currency: "MGA",
  language: "fr",
  date: "2026-11-14",
  discount: "",
  exchange_rate: "",
  descriptions: ["Logo", ""],
  quantities: ["1", "1"],
  prices: ["450 000", ""],
};
const options = { today: "2026-10-15", defaultCurrency: "MGA" as const };

describe("formulaire devis / facture", () => {
  it("lit l'en-tête et les lignes, ignore la ligne vide", () => {
    const result = parseDocumentForm(base, options);
    expect(result).toEqual({
      ok: true,
      data: {
        contact_id: CONTACT,
        deal_id: null,
        currency: "MGA",
        language: "fr",
        date: "2026-11-14",
        discount: 0,
        exchange_rate: 1,
        lines: [{ description: "Logo", quantity: "1", quantityValue: 1, unit_price: 450_000 }],
      },
    });
  });

  it("montants en centimes pour l'euro, remise comprise", () => {
    const result = parseDocumentForm(
      { ...base, currency: "EUR", prices: ["1 250,50", ""], quantities: ["2,5", "1"], discount: "50" },
      options,
    );
    expect(result.ok && result.data.lines[0]).toEqual({ description: "Logo", quantity: "2.5", quantityValue: 2.5, unit_price: 125_050 });
    expect(result.ok && result.data.discount).toBe(5000);
  });

  it("signale chaque champ de ligne invalide à sa place", () => {
    const result = parseDocumentForm(
      { ...base, descriptions: ["", "Cartes"], quantities: ["1", "1,005"], prices: ["1000", "abc"] },
      options,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        line_0_description: "required",
        line_1_quantity: "quantity_format",
        line_1_unit_price: "amount_format",
      },
    });
  });

  it("exige au moins une ligne", () => {
    const result = parseDocumentForm({ ...base, descriptions: [""], quantities: ["1"], prices: [""] }, options);
    expect(result).toEqual({ ok: false, fieldErrors: { lines: "lines_required" } });
  });

  it("refuse une remise qui annule le total", () => {
    const result = parseDocumentForm({ ...base, discount: "450 000" }, options);
    expect(result).toEqual({ ok: false, fieldErrors: { discount: "discount_too_large" } });
  });

  it("refuse une validité déjà passée et un client absent", () => {
    const result = parseDocumentForm({ ...base, date: "2026-10-14", contact_id: "" }, options);
    expect(result).toEqual({ ok: false, fieldErrors: { contact_id: "required", valid_until: "date_past" } });
  });

  it("facture dans une autre devise : taux obligatoire", () => {
    const invoice = { ...base, kind: "invoice" as const, currency: "EUR", prices: ["100", ""] };
    expect(parseDocumentForm(invoice, options)).toEqual({ ok: false, fieldErrors: { exchange_rate: "required" } });
    expect(parseDocumentForm({ ...invoice, exchange_rate: "1" }, options)).toEqual({
      ok: false,
      fieldErrors: { exchange_rate: "rate_format" },
    });
    const ok = parseDocumentForm({ ...invoice, exchange_rate: "5 000,5" }, options);
    expect(ok.ok && ok.data.exchange_rate).toBe(5000.5);
  });

  it("garde l'opportunité liée et la langue anglaise", () => {
    const deal = "0f1c2b8e-1d2a-4c3b-9e4f-5a6b7c8d9e0f";
    const result = parseDocumentForm({ ...base, deal_id: deal, language: "en" }, options);
    expect(result.ok && [result.data.deal_id, result.data.language]).toEqual([deal, "en"]);
  });
});
