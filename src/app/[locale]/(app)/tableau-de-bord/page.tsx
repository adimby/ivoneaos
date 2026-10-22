import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/money";
import { hasQuote, listRecentlyPaidInvoices } from "@/modules/billing/queries";
import { ActivityBlocks } from "@/modules/dashboard/components/activity-blocks";
import { getDashboardSummary } from "@/modules/dashboard/queries";
import { TodayReminders } from "@/modules/crm/components/today-reminders";
import { hasActiveContact } from "@/modules/crm/queries";
import { checklistTextLevel, startChecklist } from "@/modules/onboarding/checklist";
import { getWhopAccount, isPapiConnected } from "@/modules/payments/queries";
import { whopEnabled } from "@/modules/payments/whop/service";
import { hasFiscalInfo } from "@/modules/workspace/profile-schema";
import { requireWorkspace } from "@/modules/workspace/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/tableau-de-bord">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("metaTitle") };
}

// Accueil : 4 blocs (encaissé ce mois-ci, factures en attente, opportunités ouvertes par
// étape, rappels du jour) et la liste de démarrage, en tête tant qu'elle n'est pas finie.
// Tablette et ordinateur : les 4 blocs en grille de deux colonnes.
export default async function DashboardPage({ params }: PageProps<"/[locale]/tableau-de-bord">) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const [hasContact, papiConnected, whopAccount, quote, paidInvoices, summary, t, tLevels] = await Promise.all([
    hasActiveContact(workspace.id),
    isPapiConnected(workspace.id),
    whopEnabled() ? getWhopAccount(workspace.id) : undefined,
    hasQuote(workspace.id),
    listRecentlyPaidInvoices(workspace.id),
    getDashboardSummary(workspace.id, workspace.default_currency),
    getTranslations({ locale, namespace: "Dashboard" }),
    getTranslations({ locale, namespace: "Levels" }),
  ]);
  const items = startChecklist(workspace.level, {
    hasContact,
    papiConnected,
    hasQuote: quote,
    hasFiscalInfo: hasFiscalInfo(workspace),
  });
  const textLevel = checklistTextLevel(workspace.level);
  const doneCount = items.filter((item) => item.done).length;
  const allDone = doneCount === items.length;
  const checklist = (
    <Card aria-labelledby="checklist-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="checklist-title" className="text-lg font-bold text-lagoon">
          {t("checklist.title")}
        </h2>
        <span className="text-sm font-semibold text-ink-muted">
          {t("checklist.progress", { done: doneCount, total: items.length })}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sand/60" aria-hidden="true">
        <div className="h-full rounded-full bg-turquoise" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      {allDone && <p className="text-sm font-semibold text-success">{t("checklist.allDone")}</p>}
      <ol className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              data-testid={`checklist-${item.key}`}
              data-done={item.done}
              className="flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-surface p-3 hover:border-lagoon"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                  item.done ? "border-success bg-success text-surface" : "border-sand-strong text-transparent",
                )}
                aria-hidden="true"
              >
                <CheckIcon className="size-4" />
              </span>
              <span className="flex flex-1 flex-col">
                <span className={cn("text-base font-semibold", item.done && "text-ink-muted line-through")}>
                  {t(`items.${item.key}.${textLevel}.title`)}
                </span>
                <span className="text-sm text-ink-muted">{t(`items.${item.key}.${textLevel}.description`)}</span>
                <span className="sr-only">{item.done ? t("checklist.done") : t("checklist.todo")}</span>
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base text-ink-muted">{t("greeting")}</p>
        <h1 className="text-2xl font-bold text-lagoon">{workspace.name}</h1>
        <Badge className="self-start">{t("level", { level: tLevels(`${workspace.level}.name`) })}</Badge>
      </div>

      {paidInvoices.length > 0 && (
        <section aria-labelledby="paid-title" className="flex flex-col gap-2 rounded-card bg-success-soft p-4" data-testid="recently-paid">
          <h2 id="paid-title" className="text-base font-bold text-success">
            {t("paid.title")}
          </h2>
          <ul className="flex flex-col gap-1">
            {paidInvoices.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  href={`/factures/${invoice.id}`}
                  className="inline-flex min-h-11 items-center text-base font-semibold text-ink underline-offset-4 hover:underline"
                >
                  {t("paid.item", { number: invoice.number ?? "", amount: formatMoney(invoice.amount_paid, invoice.currency, locale) })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!allDone && checklist}

      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4" data-testid="dash-blocks">
        <ActivityBlocks summary={summary} locale={locale} next={{ hasContact, hasQuote: quote, papiConnected, whopConnected: whopAccount === undefined ? null : whopAccount?.status === "connected" }} />
        <TodayReminders workspaceId={workspace.id} locale={locale} />
      </div>

      {allDone && checklist}
    </div>
  );
}
