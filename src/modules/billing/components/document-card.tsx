import { ChevronRightIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import { formatMoney, type Currency } from "@/lib/money";
import type { InvoiceStatus, QuoteStatus } from "../status";
import { StatusBadge } from "./status-badge";

// Colonnes de la liste sur grand écran (xl, 1280 px et plus) : numéro (largeur fixe, il
// n'est jamais coupé), client, montant, date, statut, flèche. Chaque ligne est sa propre
// grille : des largeurs fixes ou en fr gardent les colonnes alignées d'une ligne à l'autre.
// Petit portable (lg) : la place manque pour six colonnes, la liste garde ses cartes.
export const documentColumns =
  "xl:grid-cols-[8rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_1.25rem] xl:gap-4";

// Ligne de liste : numéro (ou « Brouillon »), client, montant avec sa devise, statut.
// table (liste des devis et factures) : sur ordinateur, une ligne de tableau (colonnes
// alignées sur les en-têtes de la liste, à partir de xl) ; date : la date seule, pour sa colonne.
export function DocumentCard({
  href,
  number,
  draftLabel,
  client,
  total,
  currency,
  locale,
  detail,
  date,
  noDateLabel,
  table = false,
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
  date?: string;
  // Lu à la place d'une date absente dans sa colonne (« Sans échéance »).
  noDateLabel?: string;
  table?: boolean;
} & ({ kind: "quote"; status: QuoteStatus } | { kind: "invoice"; status: InvoiceStatus })) {
  const amount = formatMoney(total, currency, locale);
  return (
    <Link
      href={href}
      data-testid="document-card"
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-white p-3 hover:border-lagoon",
        table && cn(documentColumns, "xl:grid xl:min-h-14 xl:px-4"),
      )}
    >
      <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", table && "xl:hidden")}>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-semibold text-ink">{number ?? draftLabel}</span>
          <StatusBadge {...status} className="shrink-0" />
        </span>
        <span className="truncate text-sm text-ink-muted">{client}</span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-lagoon">{amount}</span>
          {detail && <span className="truncate text-xs text-ink-muted">{detail}</span>}
        </span>
      </span>
      {table && (
        <>
          <span className="hidden text-base font-semibold whitespace-nowrap text-ink xl:block">{number ?? draftLabel}</span>
          <span className="hidden truncate text-base text-ink xl:block">{client}</span>
          <span className="hidden text-base font-semibold whitespace-nowrap text-lagoon xl:block">{amount}</span>
          <span className="hidden truncate text-sm text-ink-muted xl:block">{date ?? <NoDate label={noDateLabel} />}</span>
          <span className="hidden xl:flex">
            <StatusBadge {...status} />
          </span>
        </>
      )}
      <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
    </Link>
  );
}

// Colonne de date sans date : un tiret discret, et sa signification pour les lecteurs d'écran.
function NoDate({ label }: { label?: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
