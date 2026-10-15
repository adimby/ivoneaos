// Statuts affichés. La base garde le statut enregistré ; « en retard » (facture) et
// « expiré » (devis) se déduisent aussi de la date du jour à Antananarivo, sans attendre
// une écriture : une facture envoyée dont l'échéance est passée s'affiche en retard.

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
export type DocumentKind = "quote" | "invoice";

// today, validUntil, dueOn : dates « AAAA-MM-JJ » (comparables comme des chaînes).
export function quoteDisplayStatus(status: QuoteStatus, validUntil: string | null, today: string): QuoteStatus {
  if (status === "sent" && validUntil !== null && validUntil < today) return "expired";
  return status;
}

export function invoiceDisplayStatus(status: InvoiceStatus, dueOn: string | null, today: string): InvoiceStatus {
  if (status === "sent" && dueOn !== null && dueOn < today) return "overdue";
  if (status === "overdue" && (dueOn === null || dueOn >= today)) return "sent";
  return status;
}

export type BadgeTone = "accent" | "neutral" | "success" | "danger";

export const STATUS_TONE: Record<QuoteStatus | InvoiceStatus, BadgeTone> = {
  draft: "neutral",
  sent: "accent",
  accepted: "success",
  paid: "success",
  declined: "danger",
  overdue: "danger",
  expired: "neutral",
  cancelled: "neutral",
};
