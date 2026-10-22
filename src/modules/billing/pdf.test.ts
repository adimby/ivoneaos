import { createTranslator } from "next-intl";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { BRAND_FONTS, brandColors, FONT_FAMILIES } from "@/modules/branding/brand";
import { parsePublicDocument } from "./document";
import { documentView } from "./view";

vi.mock("server-only", () => ({}));
const { renderDocumentPdf } = await import("./pdf");
type Translate = Parameters<typeof renderDocumentPdf>[1];

// Rendu réel du PDF, puis texte extrait (pdf.js) : vérifie que chaque caractère passe
// par la police embarquée (le signe moins, l'espace fine des montants, le n̈ malgache)
// au lieu de disparaître comme avec l'Helvetica intégrée (WinAnsi).
async function pdfText(pdf: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: false });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) if ("str" in item) parts.push(item.str);
  }
  await task.destroy();
  // pdf.js rend les espaces insécables (fine ou non) comme des espaces simples.
  return parts.join("\n").replace(/[\u00a0\u202f]/g, " ");
}

const quote = {
  type: "quote",
  number: "D-2026-0001",
  status: "sent",
  language: "fr",
  currency: "MGA",
  valid_until: "2026-11-14",
  sent_at: "2026-10-14T09:00:00Z",
  accepted_at: null,
  subtotal: 475000,
  discount: 25000,
  total: 450000,
  version: "abc",
  freelancer: {
    business_name: "Studio Hanitra",
    logo_path: null,
    nif: "3000123456",
    stat: "74111112020001234",
    tax_regime: "impot_synthetique",
    address: "Lot II A 12, Antananarivo",
    invoice_footer: null,
  },
  client: { name: "Ran̈aivo Andrianjafy", company_name: "Boutique Soa" },
  lines: [{ description: "Logo « Océan » – déclinaisons", quantity: 1, unit_price: 475000, line_total: 475000 }],
};

function translator(locale: "fr" | "en"): Translate {
  return createTranslator({ locale, messages: locale === "fr" ? fr : en, namespace: "Pdf" }) as unknown as Translate;
}

describe("PDF d'un document", () => {
  it("garde le signe moins de la remise, les montants « 450 000 Ar » et les caractères saisis", async () => {
    const view = documentView(parsePublicDocument(quote)!, {
      locale: "fr",
      now: new Date("2026-10-15T09:00:00Z"),
      publicUrl: "https://app.test/fr/p/tok",
    });
    const text = await pdfText(await renderDocumentPdf(view, translator("fr")));

    expect(text).toContain("DEVIS");
    expect(text).toContain("D-2026-0001");
    expect(text).toContain("− 25 000 Ar");
    expect(text).toContain("450 000 Ar");
    expect(text).toContain("Ran̈aivo Andrianjafy");
    expect(text).toContain("Logo « Océan » – déclinaisons");
    expect(text).toContain("NIF : 3000123456");
    expect(text).toContain("STAT : 74111112020001234");
    expect(text).toContain("Impôt synthétique");
    expect(text).toContain("https://app.test/fr/p/tok");
    expect(text).toContain("Facturé avec Ivonea OS");
  });

  it("suit la langue du document (anglais : « NIF: », mention traduite)", async () => {
    const doc = parsePublicDocument({ ...quote, language: "en" })!;
    const view = documentView(doc, { locale: "en", now: new Date("2026-10-15T09:00:00Z"), publicUrl: null });
    const text = await pdfText(await renderDocumentPdf(view, translator("en")));
    expect(text).toContain("QUOTE");
    expect(text).toContain("NIF: 3000123456");
    expect(text).toContain("Invoiced with Ivonea OS");
  });

  // Chaque police de l'image de marque : embarquée (nom PostScript dans le PDF) et
  // complète pour nos textes (accents, n̈, signe moins, espace fine, €).
  for (const font of BRAND_FONTS) {
    it(`police ${font} : embarquée et sans caractère perdu`, async () => {
      const doc = parsePublicDocument({
        ...quote,
        currency: "EUR",
        freelancer: { ...quote.freelancer, brand: { font, primary_color: "#5B2B5E", accent_color: "#D4A24C", logo_position: "center" } },
      })!;
      const view = documentView(doc, { locale: "fr", now: new Date("2026-10-15T09:00:00Z"), publicUrl: null });
      const pdf = await renderDocumentPdf(view, translator("fr"));
      const postscript = FONT_FAMILIES[font].files[1].replace(".ttf", "");
      expect(pdf.toString("latin1")).toContain(postscript);
      const text = await pdfText(pdf);
      expect(text).toContain("Ran̈aivo Andrianjafy");
      expect(text).toContain("Logo « Océan » – déclinaisons");
      expect(text).toContain("− 250,00 €");
      expect(text).toContain("4 500,00 €");
    });
  }

  it("marque de la copie figée, rendue sans erreur (accent clair : texte noir sur son aplat)", async () => {
    const doc = parsePublicDocument({
      ...quote,
      freelancer: { ...quote.freelancer, brand: { primary_color: "#5B2B5E", accent_color: "#F2C14E" } },
    })!;
    const view = documentView(doc, { locale: "fr", now: new Date("2026-10-15T09:00:00Z"), publicUrl: null });
    expect(view.brand.primary).toBe("#5B2B5E");
    expect(brandColors(view.brand)).toEqual({
      primary: "#5B2B5E",
      onPrimary: "#FFFFFF",
      accent: "#F2C14E",
      onAccent: "#000000",
      accentEdge: "#5B2B5E",
    });
    expect(await pdfText(await renderDocumentPdf(view, translator("fr")))).toContain("450 000 Ar");
  });
});
