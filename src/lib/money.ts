export const CURRENCIES = ["MGA", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

// Les montants sont stockés en entiers dans la plus petite unité :
// ariary entiers pour MGA, centimes pour EUR et USD.
const MINOR_DIGITS: Record<Currency, number> = { MGA: 0, EUR: 2, USD: 2 };

export function formatMoney(
  amountMinor: number,
  currency: Currency,
  locale = "fr",
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Montant invalide : ${amountMinor}`);
  }
  const digits = MINOR_DIGITS[currency];
  const amount = amountMinor / 10 ** digits;

  if (currency === "MGA") {
    const number = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    }).format(amount);
    return `${number} Ar`;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
  }).format(amount);
}

export function lineTotal(quantity: number, unitPriceMinor: number): number {
  return Math.round(quantity * unitPriceMinor);
}

// Conversion vers la devise par défaut du workspace avec invoices.exchange_rate.
// Le taux est exprimé par unité MAJEURE : unités de la devise cible pour 1 unité de la
// devise source (1 EUR = 5000 MGA → 5000). Les montants restent en unités mineures :
// montant × taux × 10^(décimales cible − décimales source), arrondi à l'unité.
export function convertMinor(
  amountMinor: number,
  from: Currency,
  to: Currency,
  rate: number,
): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Montant invalide : ${amountMinor}`);
  }
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RangeError(`Taux invalide : ${rate}`);
  }
  if (from === to) return amountMinor;
  const result = Math.round(
    amountMinor * rate * 10 ** (MINOR_DIGITS[to] - MINOR_DIGITS[from]),
  );
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Montant converti hors plage : ${result}`);
  }
  return result;
}

export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

// Montant saisi (« 450 000 », « 1 250,50 », « 1250.5 ») → unités mineures.
// Espaces ignorés ; virgule ou point décimal ; pas de décimales en ariary, 2 au plus sinon.
export function parseAmountInput(
  input: string,
  currency: Currency,
): { ok: true; minor: number } | { ok: false; error: "invalid_number" | "too_large" } {
  const compact = input.replace(/[\s  ]/g, "");
  const digits = MINOR_DIGITS[currency];
  const pattern = digits === 0 ? /^\d+$/ : /^\d+(?:[.,]\d{1,2})?$/;
  if (!pattern.test(compact)) return { ok: false, error: "invalid_number" };
  const [whole, fraction = ""] = compact.split(/[.,]/);
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || 0);
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) return { ok: false, error: "too_large" };
  return { ok: true, minor };
}

// Valeur d'un champ montant à partir d'unités mineures (« 1250,50 », « 450000 »).
export function amountInputValue(amountMinor: number, currency: Currency): string {
  const digits = MINOR_DIGITS[currency];
  if (digits === 0) return String(amountMinor);
  const whole = Math.floor(amountMinor / 10 ** digits);
  const fraction = String(amountMinor % 10 ** digits).padStart(digits, "0");
  return `${whole},${fraction}`;
}
