import { describe, expect, it } from "vitest";
import { invoiceDocument, parsePublicDocument, type DraftSource } from "./document";
import { documentView } from "./view";

// Intl sépare les milliers par une espace insécable (fine en français).
const plain = (s: string | null) => s?.replace(/[\u00a0\u202f]/g, " ") ?? null;
const now = new Date("2026-10-15T09:00:00Z");

const publicQuote = {
  type: "quote",
  number: "D-2026-0001",
  status: "sent",
  language: "fr",
  currency: "MGA",
  valid_until: "2026-11-14",
  sent_at: "2026-10-14T22:30:00Z",
  accepted_at: null,
  subtotal: 475003,
  discount: 25003,
  total: 450000,
  version: "abc",
  freelancer: {
    business_name: "Studio Alice",
    logo_path: "ws/logo.png",
    nif: "3000123456",
    stat: "74111112020001234",
    tax_regime: "impot_synthetique",
    address: "Lot II A 12, Antananarivo",
    invoice_footer: null,
  },
  client: { name: "Rakoto", company_name: "Boutique Soa" },
  lines: [
    { description: "Logo", quantity: 1, unit_price: 400000, line_total: 400000 },
    { description: "Cartes", quantity: 2.5, unit_price: 30001, line_total: 75003 },
  ],
};

describe("documentView (PDF et page publique)", () => {
  it("formate un devis émis : montants en ariary, dates en français, heure de Madagascar", () => {
    const doc = parsePublicDocument(publicQuote)!;
    const view = documentView(doc, { locale: "fr", now, publicUrl: "https://app.test/fr/p/tok" });
    expect(view.kind).toBe("quote");
    expect(view.draft).toBe(false);
    expect(view.number).toBe("D-2026-0001");
    expect(view.status).toBe("sent");
    expect(plain(view.total)).toBe("450 000 Ar");
    expect(plain(view.subtotal)).toBe("475 003 Ar");
    expect(plain(view.discount)).toBe("25 003 Ar");
    expect(view.lines.map((l) => [l.description, l.quantity, plain(l.unitPrice), plain(l.total)])).toEqual([
      ["Logo", "1", "400 000 Ar", "400 000 Ar"],
      ["Cartes", "2,5", "30 001 Ar", "75 003 Ar"],
    ]);
    // Envoyé à 22 h 30 UTC = le 15 à 1 h 30 à Antananarivo.
    expect(view.dates).toEqual([
      { key: "date", value: "15 octobre 2026" },
      { key: "validUntil", value: "14 novembre 2026" },
    ]);
    expect(view.freelancer).toMatchObject({ name: "Studio Alice", nif: "3000123456", taxRegime: "impot_synthetique" });
    expect(view.client).toEqual({ name: "Rakoto", company: "Boutique Soa" });
    expect(view.publicUrl).toBe("https://app.test/fr/p/tok");
    expect(view.payment).toBeNull();
  });

  it("devis dont la validité est passée : expiré", () => {
    const doc = parsePublicDocument({ ...publicQuote, valid_until: "2026-10-14" })!;
    expect(documentView(doc, { locale: "fr", now, publicUrl: null }).status).toBe("expired");
  });

  it("facture brouillon en euros, en anglais : coordonnées manuelles, sans remise", () => {
    const source: DraftSource = {
      freelancer: publicQuote.freelancer as DraftSource["freelancer"],
      client: { name: "Jane", company_name: null },
      lines: [{ description: "Design", quantity: 3, unit_price: 12050, line_total: 36150 }],
      manualInstructions: "MVola : 034 12 345 67\nRIB : 00005000011234567890123\n",
    };
    const doc = invoiceDocument(
      {
        number: null,
        status: "draft",
        language: "en",
        currency: "EUR",
        issued_on: null,
        due_on: "2026-10-30",
        paid_at: null,
        subtotal: 36150,
        discount: 0,
        total: 36150,
        amount_paid: 0,
      },
      source,
    );
    const view = documentView(doc, { locale: "en", now, publicUrl: null });
    expect(view.draft).toBe(true);
    expect(view.number).toBeNull();
    expect(view.total).toBe("€361.50");
    expect(view.discount).toBeNull();
    expect(view.lines[0]).toEqual({ description: "Design", quantity: "3", unitPrice: "€120.50", total: "€361.50" });
    expect(view.dates).toEqual([
      { key: "issuedOn", value: "October 15, 2026" },
      { key: "dueOn", value: "October 30, 2026" },
    ]);
    expect(view.payment).toEqual({
      instructions: ["MVola : 034 12 345 67", "RIB : 00005000011234567890123"],
      linkUrl: null,
    });
  });

  it("facture envoyée en retard et partiellement payée : reste à payer", () => {
    const doc = parsePublicDocument({
      ...publicQuote,
      type: "invoice",
      number: "F-2026-0001",
      status: "sent",
      issued_on: "2026-09-01",
      due_on: "2026-09-30",
      paid_at: null,
      amount_paid: 150000,
      payment: { manual_instructions: null, payment_link_url: null },
    })!;
    const view = documentView(doc, { locale: "fr", now, publicUrl: null });
    expect(view.status).toBe("overdue");
    expect(plain(view.amountPaid)).toBe("150 000 Ar");
    expect(plain(view.amountDue)).toBe("300 000 Ar");
    // Ni coordonnées ni lien : pas de bloc paiement vide.
    expect(view.payment).toBeNull();
  });

  it("refuse une réponse vide (jeton inconnu ou brouillon)", () => {
    expect(parsePublicDocument(null)).toBeNull();
    expect(parsePublicDocument({ type: "autre" })).toBeNull();
  });
});
