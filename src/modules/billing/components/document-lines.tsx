import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { formatMoney, type Currency } from "@/lib/money";

// Lignes et totaux d'un document, dans l'application (vue de la freelance).
export function DocumentLines({
  lines,
  currency,
  locale,
  subtotal,
  discount,
  total,
}: {
  lines: { id: string; description: string; quantity: number; unit_price: number; line_total: number }[];
  currency: Currency;
  locale: string;
  subtotal: number;
  discount: number;
  total: number;
}) {
  const t = useTranslations("Billing.detail");
  const money = (amount: number) => formatMoney(amount, currency, locale);
  const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return (
    <Card aria-labelledby="lines-title" className="flex flex-col gap-3">
      <h2 id="lines-title" className="text-lg font-bold text-lagoon">
        {t("lines")}
      </h2>
      <ul className="flex flex-col divide-y divide-sand/70">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-3 py-2">
            <span className="flex min-w-0 flex-col">
              <span className="text-base break-words text-ink">{line.description}</span>
              <span className="text-sm text-ink-muted">
                {t("quantityTimes", { quantity: quantity.format(line.quantity), price: money(line.unit_price) })}
              </span>
            </span>
            <span className="shrink-0 text-base font-semibold text-ink">{money(line.line_total)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1 border-t border-sand pt-3 text-base">
        {discount > 0 && (
          <>
            <div className="flex justify-between text-ink-muted">
              <dt>{t("subtotal")}</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-ink-muted">
              <dt>{t("discount")}</dt>
              <dd>− {money(discount)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between text-lg font-bold text-lagoon">
          <dt>{t("total")}</dt>
          <dd>{money(total)}</dd>
        </div>
      </dl>
    </Card>
  );
}
