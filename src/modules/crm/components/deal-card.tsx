import { ChevronRightIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import { formatMoney, type Currency } from "@/lib/money";
import type { DealListItem } from "../queries";

// Carte d'opportunité : titre, contact, montant avec sa devise. column : carte d'une
// colonne étroite du pipeline sur ordinateur (titre sur deux lignes, sans flèche).
export function DealCard({
  deal,
  locale,
  noAmount,
  extra,
  column = false,
}: {
  deal: DealListItem;
  locale: string;
  noAmount: string;
  extra?: string;
  column?: boolean;
}) {
  const amount = deal.amount !== null ? formatMoney(deal.amount, deal.currency as Currency, locale) : null;
  return (
    <Link
      href={`/pipeline/${deal.id}`}
      data-testid="deal-card"
      className="flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-surface p-3 hover:border-lagoon"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-base font-semibold text-ink", column && "lg:line-clamp-2 lg:whitespace-normal lg:break-words")}>
          {deal.title}
        </span>
        <span className="truncate text-sm text-ink-muted">{extra ?? deal.contacts?.name}</span>
        {/* Colonne étroite : passage à la ligne permis avant « Ar » (espace ordinaire), jamais
            dans le nombre (espaces insécables du format) ; un nombre plus large que la carte
            seul se coupe plutôt que de déborder. */}
        <span className={cn("text-sm font-semibold whitespace-nowrap text-lagoon", column && "lg:break-words lg:whitespace-normal")}>
          {amount ?? noAmount}
        </span>
      </span>
      <ChevronRightIcon className={cn("size-5 shrink-0 text-ink-muted", column && "lg:hidden")} />
    </Link>
  );
}
