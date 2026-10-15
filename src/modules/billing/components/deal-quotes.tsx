import { getTranslations } from "next-intl/server";
import { PlusIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { localDate } from "@/lib/time";
import { listDealQuotes } from "../queries";
import { quoteDisplayStatus } from "../status";
import { DocumentCard } from "./document-card";

// Devis d'une opportunité (page de l'opportunité) et « Créer un devis » (client prérempli).
export async function DealQuotes({
  workspaceId,
  dealId,
  client,
  locale,
  canCreate,
}: {
  workspaceId: string;
  dealId: string;
  client: string;
  locale: string;
  canCreate: boolean;
}) {
  const [quotes, t] = await Promise.all([listDealQuotes(workspaceId, dealId), getTranslations({ locale, namespace: "Billing" })]);
  const today = localDate(new Date());
  return (
    <Card aria-labelledby="deal-quotes-title" className="flex flex-col gap-3">
      <h2 id="deal-quotes-title" className="text-lg font-bold text-lagoon">
        {t("deal.title")}
      </h2>
      {quotes.length === 0 ? (
        <p className="text-base text-ink-muted">{t("deal.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {quotes.map((q) => (
            <li key={q.id}>
              <DocumentCard
                href={`/devis/${q.id}`}
                kind="quote"
                status={quoteDisplayStatus(q.status, q.valid_until, today)}
                number={q.number}
                draftLabel={t("draft")}
                client={client}
                total={q.total}
                currency={q.currency}
                locale={locale}
              />
            </li>
          ))}
        </ul>
      )}
      {canCreate && (
        <Link href={`/devis/nouveau?deal=${dealId}`} className={buttonClasses("secondary", true)}>
          <PlusIcon className="size-5" />
          {t("deal.newQuote")}
        </Link>
      )}
    </Card>
  );
}
