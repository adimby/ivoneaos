import { CURRENCIES, parseAmountInput, type Currency } from "@/lib/money";
import type { FieldErrors } from "@/lib/forms";
import type { Language } from "./document";
import { computeTotals, parseQuantityInput, parseRateInput } from "./totals";

// Formulaire devis / facture : en-tête et lignes (champs répétés line_description,
// line_quantity, line_unit_price, dans l'ordre affiché). Erreurs : clés FormErrors.*,
// par champ (« line_2_quantity » pour la 3e ligne).

export const MAX_LINES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type DocumentFormInput = {
  kind: "quote" | "invoice";
  contact_id: string;
  deal_id: string;
  currency: string;
  language: string;
  // Validité (devis) ou échéance (facture).
  date: string;
  discount: string;
  exchange_rate: string;
  descriptions: string[];
  quantities: string[];
  prices: string[];
};

export type ParsedLine = { description: string; quantity: string; quantityValue: number; unit_price: number };

export type ParsedDocument = {
  contact_id: string;
  deal_id: string | null;
  currency: Currency;
  language: Language;
  date: string;
  discount: number;
  exchange_rate: number;
  lines: ParsedLine[];
};

export function readDocumentForm(formData: FormData, kind: "quote" | "invoice"): DocumentFormInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const all = (key: string) => formData.getAll(key).map((v) => (typeof v === "string" ? v : ""));
  return {
    kind,
    contact_id: text("contact_id"),
    deal_id: text("deal_id"),
    currency: text("currency"),
    language: text("language"),
    date: text(kind === "quote" ? "valid_until" : "due_on"),
    discount: text("discount"),
    exchange_rate: text("exchange_rate"),
    descriptions: all("line_description"),
    quantities: all("line_quantity"),
    prices: all("line_unit_price"),
  };
}

// today : date du jour à Antananarivo (AAAA-MM-JJ). defaultCurrency : devise du workspace
// (taux obligatoire pour une facture dans une autre devise).
export function parseDocumentForm(
  input: DocumentFormInput,
  { today, defaultCurrency }: { today: string; defaultCurrency: Currency },
): { ok: true; data: ParsedDocument } | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  const dateField = input.kind === "quote" ? "valid_until" : "due_on";

  if (!UUID.test(input.contact_id)) errors.contact_id = "required";
  const deal_id = UUID.test(input.deal_id) ? input.deal_id : null;
  const currency = (CURRENCIES as readonly string[]).includes(input.currency) ? (input.currency as Currency) : null;
  if (!currency) errors.currency = "invalid_choice";
  const language: Language = input.language === "en" ? "en" : "fr";

  const date = input.date.trim();
  if (!date) errors[dateField] = "required";
  else if (!DAY.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors[dateField] = "date_format";
  else if (date < today) errors[dateField] = "date_past";

  const lines: ParsedLine[] = [];
  const count = Math.max(input.descriptions.length, input.quantities.length, input.prices.length);
  for (let i = 0; i < count; i++) {
    const description = (input.descriptions[i] ?? "").trim();
    const quantityText = (input.quantities[i] ?? "").trim();
    const priceText = (input.prices[i] ?? "").trim();
    // Ligne laissée vide : ignorée (prix seul ou quantité seule : signalée).
    if (!description && !priceText && (!quantityText || quantityText === "1")) continue;
    if (!description) errors[`line_${i}_description`] = "required";
    else if (description.length > 2000) errors[`line_${i}_description`] = "too_long";
    const quantity = parseQuantityInput(quantityText);
    if (!quantity.ok) errors[`line_${i}_quantity`] = "quantity_format";
    const price = currency ? parseAmountInput(priceText, currency) : null;
    if (currency && (!price || !price.ok)) {
      errors[`line_${i}_unit_price`] = priceText === "" ? "required" : price && !price.ok && price.error === "too_large" ? "too_large" : "amount_format";
    }
    if (description && description.length <= 2000 && quantity.ok && price?.ok) {
      lines.push({ description, quantity: quantity.text, quantityValue: quantity.value, unit_price: price.minor });
    }
  }
  if (count > MAX_LINES) errors.lines = "too_many_lines";
  else if (lines.length === 0 && !Object.keys(errors).some((k) => k.startsWith("line_"))) errors.lines = "lines_required";

  let discount = 0;
  const discountText = input.discount.trim();
  if (discountText && currency) {
    const parsed = parseAmountInput(discountText, currency);
    if (!parsed.ok) errors.discount = parsed.error === "too_large" ? "too_large" : "amount_format";
    else discount = parsed.minor;
  }

  let exchange_rate = 1;
  if (input.kind === "invoice" && currency && currency !== defaultCurrency) {
    const rate = parseRateInput(input.exchange_rate);
    if (rate === null || rate === 1) errors.exchange_rate = input.exchange_rate.trim() ? "rate_format" : "required";
    else exchange_rate = rate;
  }

  if (Object.keys(errors).length === 0) {
    const totals = computeTotals(
      lines.map((l) => ({ quantity: l.quantityValue, unit_price: l.unit_price })),
      discount,
    );
    if (totals.tooLarge) errors.lines = "too_large";
    else if (discount > 0 && discount >= totals.subtotal) errors.discount = "discount_too_large";
  }

  if (Object.keys(errors).length > 0 || !currency) return { ok: false, fieldErrors: errors };
  return { ok: true, data: { contact_id: input.contact_id, deal_id, currency, language, date, discount, exchange_rate, lines } };
}
