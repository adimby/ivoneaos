import type { Currency } from "@/lib/money";
import type { InvoiceStatus, QuoteStatus } from "./status";

// Document tel que le client le voit : forme renvoyée par get_public_quote et
// get_public_invoice (copie figée à l'émission). Un brouillon (aperçu de la freelance)
// est mis sous la même forme à partir des données à jour (draftDocument).

export type Language = "fr" | "en";

export type Freelancer = {
  business_name: string;
  logo_path: string | null;
  nif: string | null;
  stat: string | null;
  tax_regime: "tva" | "impot_synthetique" | null;
  address: string | null;
  invoice_footer: string | null;
};

export type Client = { name: string; company_name: string | null };

export type DocumentLine = { description: string; quantity: number; unit_price: number; line_total: number };

type Common = {
  number: string | null;
  language: Language;
  currency: Currency;
  subtotal: number;
  discount: number;
  total: number;
  freelancer: Freelancer;
  client: Client;
  lines: DocumentLine[];
};

export type QuoteDocument = Common & {
  type: "quote";
  status: QuoteStatus;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  // Empreinte de la version vue par le client (accept_quote). null pour un brouillon.
  version: string | null;
};

export type InvoiceDocument = Common & {
  type: "invoice";
  status: InvoiceStatus;
  issued_on: string | null;
  due_on: string | null;
  paid_at: string | null;
  amount_paid: number;
  // Coordonnées de paiement, seulement tant que la facture est à payer.
  payment: { manual_instructions: string | null; payment_link_url: string | null } | null;
};

export type BillingDocument = QuoteDocument | InvoiceDocument;

// Réponse JSON de la base → document typé (null : jeton inconnu ou brouillon).
export function parsePublicDocument(value: unknown): BillingDocument | null {
  if (typeof value !== "object" || value === null) return null;
  const doc = value as BillingDocument;
  if (doc.type !== "quote" && doc.type !== "invoice") return null;
  return {
    ...doc,
    language: doc.language === "en" ? "en" : "fr",
    lines: (doc.lines ?? []).map((line) => ({ ...line, quantity: Number(line.quantity) })),
  };
}

// Brouillon (ou aperçu) d'après les données à jour du workspace et du contact.
export type DraftSource = {
  freelancer: Freelancer;
  client: Client;
  lines: { description: string; quantity: number; unit_price: number; line_total: number }[];
  manualInstructions: string | null;
};

export function quoteDocument(
  row: {
    number: string | null;
    status: QuoteStatus;
    language: Language;
    currency: Currency;
    valid_until: string | null;
    sent_at: string | null;
    accepted_at: string | null;
    subtotal: number;
    discount: number;
    total: number;
  },
  source: DraftSource,
): QuoteDocument {
  return {
    type: "quote",
    number: row.number,
    status: row.status,
    language: row.language,
    currency: row.currency,
    valid_until: row.valid_until,
    sent_at: row.sent_at,
    accepted_at: row.accepted_at,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    version: null,
    freelancer: source.freelancer,
    client: source.client,
    lines: source.lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
  };
}

export function invoiceDocument(
  row: {
    number: string | null;
    status: InvoiceStatus;
    language: Language;
    currency: Currency;
    issued_on: string | null;
    due_on: string | null;
    paid_at: string | null;
    subtotal: number;
    discount: number;
    total: number;
    amount_paid: number;
  },
  source: DraftSource,
): InvoiceDocument {
  const payable = row.status === "draft" || row.status === "sent" || row.status === "overdue";
  return {
    type: "invoice",
    number: row.number,
    status: row.status,
    language: row.language,
    currency: row.currency,
    issued_on: row.issued_on,
    due_on: row.due_on,
    paid_at: row.paid_at,
    subtotal: row.subtotal,
    discount: row.discount,
    total: row.total,
    amount_paid: row.amount_paid,
    payment: payable ? { manual_instructions: source.manualInstructions, payment_link_url: null } : null,
    freelancer: source.freelancer,
    client: source.client,
    lines: source.lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
  };
}
