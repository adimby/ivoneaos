import { ChevronRightIcon } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { formatMoney, type Currency } from "@/lib/money";
import type { DealListItem } from "../queries";

// Carte d'opportunité : titre, contact, montant avec sa devise.
export function DealCard({ deal, locale, noAmount, extra }: { deal: DealListItem; locale: string; noAmount: string; extra?: string }) {
  return (
    <Link
      href={`/pipeline/${deal.id}`}
      data-testid="deal-card"
      className="flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-white p-3 hover:border-lagoon"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-semibold text-ink">{deal.title}</span>
        <span className="truncate text-sm text-ink-muted">{extra ?? deal.contacts?.name}</span>
        <span className="text-sm font-semibold text-lagoon">
          {deal.amount !== null ? formatMoney(deal.amount, deal.currency as Currency, locale) : noAmount}
        </span>
      </span>
      <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
    </Link>
  );
}
