import { describe, expect, it } from "vitest";
import { invoiceDisplayStatus, quoteDisplayStatus } from "./status";

describe("statuts affichés", () => {
  it("facture envoyée dont l'échéance est passée : en retard", () => {
    expect(invoiceDisplayStatus("sent", "2026-10-14", "2026-10-15")).toBe("overdue");
    expect(invoiceDisplayStatus("sent", "2026-10-15", "2026-10-15")).toBe("sent");
    expect(invoiceDisplayStatus("sent", null, "2026-10-15")).toBe("sent");
  });

  it("facture marquée en retard puis échéance repoussée : envoyée", () => {
    expect(invoiceDisplayStatus("overdue", "2026-10-20", "2026-10-15")).toBe("sent");
  });

  it("payée, annulée, brouillon : inchangés", () => {
    expect(invoiceDisplayStatus("paid", "2026-01-01", "2026-10-15")).toBe("paid");
    expect(invoiceDisplayStatus("cancelled", "2026-01-01", "2026-10-15")).toBe("cancelled");
    expect(invoiceDisplayStatus("draft", "2026-01-01", "2026-10-15")).toBe("draft");
  });

  it("devis envoyé dont la validité est passée : expiré", () => {
    expect(quoteDisplayStatus("sent", "2026-10-14", "2026-10-15")).toBe("expired");
    expect(quoteDisplayStatus("accepted", "2026-10-14", "2026-10-15")).toBe("accepted");
  });
});
