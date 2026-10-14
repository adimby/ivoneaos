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
