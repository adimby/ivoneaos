import { describe, expect, it } from "vitest";
import { mailtoUrl, pdfFileName, publicPath, whatsappShareUrl } from "./share";

describe("partage", () => {
  it("lien court dans la langue du document", () => {
    expect(publicPath("fr", "abc")).toBe("/fr/p/abc");
    expect(publicPath("en", "abc")).toBe("/en/p/abc");
  });

  it("WhatsApp vers le numéro du client, message encodé", () => {
    expect(whatsappShareUrl("+261 34 12 345 67", "Bonjour & merci")).toBe(
      "https://wa.me/261341234567?text=Bonjour%20%26%20merci",
    );
    expect(whatsappShareUrl(null, "Lien")).toBe("https://wa.me/?text=Lien");
  });

  it("e-mail de secours (mailto)", () => {
    expect(mailtoUrl("a@b.mg", "Devis D-1", "Voici")).toBe("mailto:a@b.mg?subject=Devis%20D-1&body=Voici");
  });

  it("nom du PDF", () => {
    expect(pdfFileName("F-2026-0001", "invoice")).toBe("F-2026-0001.pdf");
    expect(pdfFileName(null, "quote")).toBe("devis-brouillon.pdf");
  });
});
