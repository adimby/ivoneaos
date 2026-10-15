import { ChevronRightIcon } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { formatMoney, type Currency } from "@/lib/money";
import type { InvoiceStatus, QuoteStatus } from "../status";
import { StatusBadge } from "./status-badge";

// Ligne de liste : numéro (ou « Brouillon »), client, montant avec sa devise, statut.
export function DocumentCard({
  href,
  number,
  draftLabel,
  client,
  total,
  currency,
  locale,
  detail,
  ...status
}: {
  href: string;
  number: string | null;
  draftLabel: string;
  client: string;
  total: number;
  currency: Currency;
  locale: string;
  detail?: string;
} & ({ kind: "quote"; status: QuoteStatus } | { kind: "invoice"; status: InvoiceStatus })) {
  return (
    <Link
      href={href}
      data-testid="document-card"
      className="flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-white p-3 hover:border-lagoon"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-semibold text-ink">{number ?? draftLabel}</span>
          <StatusBadge {...status} className="shrink-0" />
        </span>
        <span className="truncate text-sm text-ink-muted">{client}</span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-lagoon">{formatMoney(total, currency, locale)}</span>
          {detail && <span className="truncate text-xs text-ink-muted">{detail}</span>}
        </span>
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
    </Link>
  );
}
