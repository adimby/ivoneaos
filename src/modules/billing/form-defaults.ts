import { amountInputValue, type Currency } from "@/lib/money";
import { localDate, startOfLocalDay } from "@/lib/time";
import type { DocumentDefaults } from "./components/document-form";
import type { Invoice, Quote } from "./queries";
import { quantityInputValue, rateInputValue } from "./totals";

// Valeurs du formulaire : nouveau document (validité 30 jours, échéance 15 jours) ou
// document enregistré (montants réécrits comme à la saisie : « 450000 », « 1250,50 »).

export function dayIn(days: number, now = new Date()): string {
  return localDate(startOfLocalDay(now, days));
}

function linesOf(record: Quote | Invoice, locale: string) {
  return record.lines.map((l) => ({
    description: l.description,
    quantity: quantityInputValue(l.quantity, locale),
    unitPrice: amountInputValue(l.unit_price, record.currency),
  }));
}

export function newDocumentDefaults(
  kind: "quote" | "invoice",
  { contactId, dealId, currency, language }: { contactId: string; dealId?: string; currency: Currency; language: "fr" | "en" },
): DocumentDefaults {
  return {
    contact_id: contactId,
    deal_id: dealId,
    currency,
    language,
    date: dayIn(kind === "quote" ? 30 : 15),
    discount: "",
    exchange_rate: "",
    lines: [],
  };
}

export function quoteDefaults(quote: Quote, locale: string): DocumentDefaults {
  return {
    id: quote.id,
    contact_id: quote.contact_id,
    deal_id: quote.deal_id ?? undefined,
    currency: quote.currency,
    language: quote.language,
    date: quote.valid_until ?? dayIn(30),
    discount: quote.discount ? amountInputValue(quote.discount, quote.currency) : "",
    exchange_rate: "",
    lines: linesOf(quote, locale),
  };
}

export function invoiceDefaults(invoice: Invoice, locale: string): DocumentDefaults {
  return {
    id: invoice.id,
    contact_id: invoice.contact_id,
    currency: invoice.currency,
    language: invoice.language,
    date: invoice.due_on ?? dayIn(15),
    discount: invoice.discount ? amountInputValue(invoice.discount, invoice.currency) : "",
    exchange_rate: invoice.exchange_rate !== 1 ? rateInputValue(invoice.exchange_rate, locale) : "",
    lines: linesOf(invoice, locale),
  };
}
