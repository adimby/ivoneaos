import { convertMinor, lineTotal, MAX_AMOUNT_MINOR, type Currency } from "@/lib/money";

// Totaux d'un devis ou d'une facture, calculés comme la base (compute_document_totals) :
// ligne = round(quantité × prix unitaire), sous-total = somme des lignes,
// total = max(sous-total − remise, 0). Montants en unités mineures (ariary, centimes).

export type PricedLine = { quantity: number; unit_price: number };

export type Totals = {
  lineTotals: number[];
  subtotal: number;
  discount: number;
  total: number;
  // Au-delà du plafond de la base (10^15 unités mineures) : refusé à l'enregistrement.
  tooLarge: boolean;
};

export function computeTotals(lines: PricedLine[], discount: number): Totals {
  const lineTotals = lines.map((line) => lineTotal(line.quantity, line.unit_price));
  const subtotal = lineTotals.reduce((sum, value) => sum + value, 0);
  const tooLarge = lineTotals.some((value) => value > MAX_AMOUNT_MINOR) || subtotal > MAX_AMOUNT_MINOR;
  return { lineTotals, subtotal, discount, total: Math.max(subtotal - discount, 0), tooLarge };
}

// Quantité saisie « 2 », « 1,5 », « 0.25 » : positive, 2 décimales au plus, moins de 10^8.
// Renvoie la valeur et son écriture décimale exacte pour la base (« 1.5 »).
export function parseQuantityInput(input: string): { ok: true; value: number; text: string } | { ok: false } {
  const compact = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(compact)) return { ok: false };
  const value = Number(compact);
  if (!(value > 0)) return { ok: false };
  return { ok: true, value, text: compact };
}

// Écriture d'une quantité dans le champ (« 1,5 » en français, « 1.5 » en anglais).
export function quantityInputValue(quantity: number, locale: string): string {
  const text = String(Math.round(quantity * 100) / 100);
  return locale === "fr" ? text.replace(".", ",") : text;
}

// Taux de change saisi « 5000 », « 4 950,5 » : unités de la devise par défaut pour
// 1 unité de la devise du document (numeric(18, 6) en base).
export function parseRateInput(input: string): number | null {
  const compact = input.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(compact)) return null;
  const value = Number(compact);
  return value > 0 ? value : null;
}

export function rateInputValue(rate: number, locale: string): string {
  const text = String(rate);
  return locale === "fr" ? text.replace(".", ",") : text;
}

// Montant du document dans la devise par défaut du workspace (tableau de bord, rappel
// sur la facture). null si le taux n'est pas encore saisi (1 entre deux devises différentes).
export function inDefaultCurrency(amount: number, currency: Currency, defaultCurrency: Currency, rate: number): number | null {
  if (currency === defaultCurrency) return amount;
  if (rate === 1) return null;
  return convertMinor(amount, currency, defaultCurrency, rate);
}
