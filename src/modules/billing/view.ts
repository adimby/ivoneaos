import { formatMoney } from "@/lib/money";
import { localDate } from "@/lib/time";
import type { BillingDocument } from "./document";
import { invoiceDisplayStatus, quoteDisplayStatus, type InvoiceStatus, type QuoteStatus } from "./status";

// Document prêt à afficher (PDF et page publique) : textes formatés dans la langue
// demandée, montants « 450 000 Ar », dates « 15 octobre 2026 ». Les libellés restent des
// clés (traduites par l'appelant) : ce module est pur et testé.

export type DateKey = "date" | "issuedOn" | "validUntil" | "dueOn" | "paidAt" | "acceptedAt";

export type DocumentView = {
  kind: "quote" | "invoice";
  draft: boolean;
  number: string | null;
  status: QuoteStatus | InvoiceStatus;
  freelancer: {
    name: string;
    address: string | null;
    nif: string | null;
    stat: string | null;
    taxRegime: "tva" | "impot_synthetique" | null;
    footer: string | null;
    logoPath: string | null;
  };
  client: { name: string; company: string | null };
  dates: { key: DateKey; value: string }[];
  lines: { description: string; quantity: string; unitPrice: string; total: string }[];
  subtotal: string;
  discount: string | null;
  total: string;
  // Facture partiellement payée : déjà reçu et reste à payer.
  amountPaid: string | null;
  amountDue: string | null;
  // online : paiement en ligne proposé (Papi : MVola, Orange Money, Airtel Money).
  payment: { instructions: string[]; online: boolean } | null;
  publicUrl: string | null;
};

export function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

export function documentView(
  doc: BillingDocument,
  { locale, now, publicUrl }: { locale: string; now: Date; publicUrl: string | null },
): DocumentView {
  const today = localDate(now);
  const money = (amount: number) => formatMoney(amount, doc.currency, locale);
  const day = (value: string) => formatDay(value, locale);
  const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const dates: DocumentView["dates"] = [];
  let status: DocumentView["status"];
  let amountPaid: string | null = null;
  let amountDue: string | null = null;
  let payment: DocumentView["payment"] = null;

  if (doc.type === "quote") {
    status = quoteDisplayStatus(doc.status, doc.valid_until, today);
    dates.push({ key: "date", value: day(doc.sent_at ? localDate(new Date(doc.sent_at)) : today) });
    if (doc.valid_until) dates.push({ key: "validUntil", value: day(doc.valid_until) });
    if (doc.accepted_at) dates.push({ key: "acceptedAt", value: day(localDate(new Date(doc.accepted_at))) });
  } else {
    status = invoiceDisplayStatus(doc.status, doc.due_on, today);
    dates.push({ key: "issuedOn", value: day(doc.issued_on ?? today) });
    if (doc.due_on) dates.push({ key: "dueOn", value: day(doc.due_on) });
    if (doc.paid_at) dates.push({ key: "paidAt", value: day(localDate(new Date(doc.paid_at))) });
    if (doc.amount_paid > 0 && doc.amount_paid < doc.total) {
      amountPaid = money(doc.amount_paid);
      amountDue = money(doc.total - doc.amount_paid);
    }
    if (doc.payment) {
      const instructions = (doc.payment.manual_instructions ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      // Seul papi_available compte : un lien encore actif ne suffit pas (compte à reconnecter,
      // reste dû sous le minimum Papi), le bouton mènerait à « paiement indisponible ».
      const online = Boolean(doc.payment.papi_available);
      if (instructions.length > 0 || online) {
        payment = { instructions, online };
      }
    }
  }

  return {
    kind: doc.type,
    draft: doc.status === "draft",
    number: doc.number,
    status,
    freelancer: {
      name: doc.freelancer.business_name,
      address: doc.freelancer.address,
      nif: doc.freelancer.nif,
      stat: doc.freelancer.stat,
      taxRegime: doc.freelancer.tax_regime,
      footer: doc.freelancer.invoice_footer,
      logoPath: doc.freelancer.logo_path,
    },
    client: { name: doc.client.name, company: doc.client.company_name },
    dates,
    lines: doc.lines.map((line) => ({
      description: line.description,
      quantity: quantity.format(line.quantity),
      unitPrice: money(line.unit_price),
      total: money(line.line_total),
    })),
    subtotal: money(doc.subtotal),
    discount: doc.discount > 0 ? money(doc.discount) : null,
    total: money(doc.total),
    amountPaid,
    amountDue,
    payment,
    publicUrl,
  };
}
