import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, InvoiceIcon, PipelineIcon, WalletIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";
import { stageLabel } from "@/modules/crm/stage-label";
import { displayAmounts, type DashboardSummary, type MoneyByCurrency } from "../summary";

// Trois blocs chiffrés de l'accueil (le quatrième, « Aujourd'hui », vient du module CRM).
// Composant serveur, sans JavaScript côté client. État vide : la prochaine action utile.
export async function ActivityBlocks({
  summary,
  locale,
  next,
}: {
  summary: DashboardSummary;
  locale: Locale;
  // whop : null quand le paiement par carte n'est pas activé (WHOP_API_KEY absente).
  next: { hasContact: boolean; hasQuote: boolean; papiConnected: boolean; whopConnected: boolean | null };
}) {
  const [t, tRoot] = await Promise.all([getTranslations({ locale, namespace: "Dashboard.blocks" }), getTranslations({ locale })]);
  const list = (amounts: MoneyByCurrency) => amounts.map((m) => formatMoney(m.amount, m.currency, locale)).join(" + ");
  const { collected, pending } = summary;
  const collectedShown = displayAmounts(collected.amount, summary.currency, collected.unconverted);
  const pendingShown = displayAmounts(pending.amount, summary.currency, pending.unconverted);
  const overdueShown = displayAmounts(pending.overdueAmount, summary.currency, pending.overdueUnconverted);
  // Prochaine action si rien n'est encaissé : Papi (ariary seulement) pour une devise par
  // défaut MGA, Whop (carte, euros et dollars) sinon, s'il est activé et pas encore connecté.
  const nextPayment =
    summary.currency === "MGA" ? (next.papiConnected ? null : "papi") : next.whopConnected === false ? "whop" : null;

  const emptyAction = (text: string, href: string, label: string) => (
    <div className="flex flex-col items-start gap-1">
      <p className="text-sm text-ink-muted">{text}</p>
      <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-base font-semibold text-lagoon underline-offset-4 hover:underline">
        {label}
        <ChevronRightIcon className="size-4" />
      </Link>
    </div>
  );

  return (
    <>
      <Card aria-labelledby="collected-title" className="flex flex-col gap-1" data-testid="dash-collected">
        <h2 id="collected-title" className="flex items-center gap-2 text-base font-bold text-lagoon">
          <WalletIcon className="size-5 text-turquoise" />
          {t("collected")}
        </h2>
        <p className="text-3xl font-bold break-words text-ink" data-testid="dash-collected-amount">
          {list(collectedShown.main)}
        </p>
        {collectedShown.extra.length > 0 && (
          <p className="text-sm text-ink" data-testid="dash-collected-unconverted">
            {t("unconverted", { amounts: list(collectedShown.extra) })}
          </p>
        )}
        {collected.count > 0 ? (
          <p className="text-sm text-ink-muted">{t("payments", { count: collected.count })}</p>
        ) : nextPayment === "papi" ? (
          emptyAction(t("empty.connectPapi"), "/reglages/paiements", t("empty.connectPapiLink"))
        ) : nextPayment === "whop" ? (
          emptyAction(t("empty.connectWhop"), "/reglages/paiements", t("empty.connectWhopLink"))
        ) : (
          <p className="text-sm text-ink-muted">{t("empty.noPayment")}</p>
        )}
      </Card>

      <Card aria-labelledby="pending-title" className="flex flex-col gap-1" data-testid="dash-pending">
        <h2 id="pending-title" className="flex items-center gap-2 text-base font-bold text-lagoon">
          <InvoiceIcon className="size-5 text-turquoise" />
          {t("pending")}
        </h2>
        {pending.count > 0 ? (
          <>
            <p className="text-3xl font-bold break-words text-ink" data-testid="dash-pending-amount">
              {list(pendingShown.main)}
            </p>
            {pendingShown.extra.length > 0 && (
              <p className="text-sm text-ink" data-testid="dash-pending-unconverted">
                {t("unconverted", { amounts: list(pendingShown.extra) })}
              </p>
            )}
            <p className="text-sm text-ink-muted" data-testid="dash-pending-count">
              {t("invoices", { count: pending.count })}
            </p>
            {pending.overdueCount > 0 && (
              <Badge tone="danger" className="self-start text-sm" data-testid="dash-overdue">
                {t("overdue", { count: pending.overdueCount, amount: list([...overdueShown.main, ...overdueShown.extra]) })}
              </Badge>
            )}
            <Link
              href="/factures"
              className="inline-flex min-h-11 items-center gap-1 self-start text-base font-semibold text-lagoon underline-offset-4 hover:underline"
            >
              {t("seeInvoices")}
              <ChevronRightIcon className="size-4" />
            </Link>
          </>
        ) : next.hasQuote ? (
          <p className="text-sm text-ink-muted">{t("empty.noPending")}</p>
        ) : (
          emptyAction(t("empty.firstQuote"), "/devis/nouveau", t("empty.firstQuoteLink"))
        )}
      </Card>

      <Card aria-labelledby="deals-title" className="flex flex-col gap-2" data-testid="dash-deals">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="deals-title" className="flex items-center gap-2 text-base font-bold text-lagoon">
            <PipelineIcon className="size-5 text-turquoise" />
            {t("deals")}
          </h2>
          {summary.openDeals > 0 && <span className="text-sm font-semibold text-ink-muted">{t("dealCount", { count: summary.openDeals })}</span>}
        </div>
        {summary.openDeals > 0 ? (
          <>
            <ul className="flex flex-col divide-y divide-sand/70">
              {summary.deals.map((stage) => (
                <li key={stage.stageId} className="flex items-baseline justify-between gap-3 py-2" data-testid="dash-stage">
                  <span className="text-base text-ink">
                    {stageLabel(tRoot, stage.name)} <span className="text-ink-muted">· {stage.count}</span>
                  </span>
                  <span className="text-right text-base font-semibold text-ink">{stage.amounts.length > 0 ? list(stage.amounts) : "—"}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/pipeline"
              className="inline-flex min-h-11 items-center gap-1 self-start text-base font-semibold text-lagoon underline-offset-4 hover:underline"
            >
              {t("seePipeline")}
              <ChevronRightIcon className="size-4" />
            </Link>
          </>
        ) : next.hasContact ? (
          emptyAction(t("empty.firstDeal"), "/pipeline/nouveau", t("empty.firstDealLink"))
        ) : (
          emptyAction(t("empty.firstContact"), "/contacts/nouveau", t("empty.firstContactLink"))
        )}
      </Card>
    </>
  );
}
