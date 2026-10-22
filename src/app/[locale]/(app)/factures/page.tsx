import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InvoiceIcon, PlusIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localDate } from "@/lib/time";
import { DocumentCard, documentColumns } from "@/modules/billing/components/document-card";
import { listInvoices, listQuotes } from "@/modules/billing/queries";
import { invoiceDisplayStatus, quoteDisplayStatus } from "@/modules/billing/status";
import { formatDay } from "@/modules/billing/view";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/factures">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Billing" });
  return { title: t("metaList") };
}

// Onglet « Factures » : factures et devis, en deux vues (liens, sans JavaScript).
// Ordinateur : listes en colonnes et action « Nouveau… » en haut à droite.
export default async function BillingPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const query = await searchParams;
  const view = query.vue === "devis" ? "quotes" : "invoices";
  const t = await getTranslations({ locale, namespace: "Billing" });
  const today = localDate(new Date());

  const tabs = [
    { key: "invoices", href: "/factures", label: t("tabs.invoices") },
    { key: "quotes", href: "/factures?vue=devis", label: t("tabs.quotes") },
  ] as const;
  const newHref = view === "quotes" ? "/devis/nouveau" : "/factures/nouvelle";
  const newLabel = view === "quotes" ? t("newQuote") : t("newInvoice");

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
        <div className="hidden lg:block">
          <Link href={newHref} className={buttonClasses("primary")}>
            <PlusIcon className="size-5" />
            {newLabel}
          </Link>
        </div>
      </div>
      {query.ok === "deleted" && <Alert tone="success">{t("notices.deleted")}</Alert>}
      <nav aria-label={t("tabs.label")} className="grid grid-cols-2 gap-1 rounded-xl bg-sand-light p-1 md:max-w-sm">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={view === tab.key ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg text-base font-semibold",
              view === tab.key ? "bg-lagoon text-on-lagoon" : "text-lagoon hover:bg-surface",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "quotes" ? <QuoteList workspaceId={workspace.id} locale={locale} today={today} /> : <InvoiceList workspaceId={workspace.id} locale={locale} today={today} />}

      <BottomBar className="lg:hidden">
        <Link href={newHref} className={buttonClasses("primary", true)}>
          <PlusIcon className="size-5" />
          {newLabel}
        </Link>
      </BottomBar>
    </div>
  );
}

async function QuoteList({ workspaceId, locale, today }: { workspaceId: string; locale: Locale; today: string }) {
  const [{ quotes, total }, t] = await Promise.all([listQuotes(workspaceId), getTranslations({ locale, namespace: "Billing" })]);
  if (quotes.length === 0) return <Empty title={t("empty.quotes.title")} body={t("empty.quotes.body")} />;
  return (
    <>
      {total > quotes.length && <p className="text-sm text-ink-muted">{t("truncated", { shown: quotes.length, total })}</p>}
      <ColumnHeaders labels={[t("columns.number"), t("columns.client"), t("columns.amount"), t("columns.validity"), t("columns.status")]} />
      <ul className="flex flex-col gap-2">
        {quotes.map((q) => (
          <li key={q.id}>
            <DocumentCard
              href={`/devis/${q.id}`}
              kind="quote"
              status={quoteDisplayStatus(q.status, q.valid_until, today)}
              number={q.number}
              draftLabel={t("draft")}
              client={q.client?.name ?? ""}
              total={q.total}
              currency={q.currency}
              locale={locale}
              detail={q.valid_until ? t("validUntil", { date: formatDay(q.valid_until, locale) }) : undefined}
              date={q.valid_until ? formatDay(q.valid_until, locale) : undefined}
              noDateLabel={t("noValidity")}
              table
            />
          </li>
        ))}
      </ul>
    </>
  );
}

async function InvoiceList({ workspaceId, locale, today }: { workspaceId: string; locale: Locale; today: string }) {
  const [{ invoices, total }, t] = await Promise.all([listInvoices(workspaceId), getTranslations({ locale, namespace: "Billing" })]);
  if (invoices.length === 0) return <Empty title={t("empty.invoices.title")} body={t("empty.invoices.body")} />;
  return (
    <>
      {total > invoices.length && <p className="text-sm text-ink-muted">{t("truncated", { shown: invoices.length, total })}</p>}
      <ColumnHeaders labels={[t("columns.number"), t("columns.client"), t("columns.amount"), t("columns.due"), t("columns.status")]} />
      <ul className="flex flex-col gap-2">
        {invoices.map((i) => (
          <li key={i.id}>
            <DocumentCard
              href={`/factures/${i.id}`}
              kind="invoice"
              status={invoiceDisplayStatus(i.status, i.due_on, today)}
              number={i.number}
              draftLabel={t("draft")}
              client={i.client?.name ?? ""}
              total={i.total}
              currency={i.currency}
              locale={locale}
              detail={showDue(i) ? t("dueOn", { date: formatDay(i.due_on, locale) }) : undefined}
              date={showDue(i) ? formatDay(i.due_on, locale) : undefined}
              noDateLabel={t("noDue")}
              table
            />
          </li>
        ))}
      </ul>
    </>
  );
}

// Échéance affichée tant que la facture reste à payer.
function showDue<T extends { due_on: string | null; status: string }>(i: T): i is T & { due_on: string } {
  return i.due_on !== null && i.status !== "paid" && i.status !== "cancelled";
}

// Grand écran (xl) : en-têtes des colonnes, visuels seulement (chaque ligne est un lien lu en entier).
function ColumnHeaders({ labels }: { labels: string[] }) {
  return (
    <div aria-hidden="true" className={cn(documentColumns, "-mb-3 hidden px-4 text-xs font-semibold tracking-wide text-ink-muted uppercase xl:grid")}>
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <InvoiceIcon className="size-10 text-turquoise" />
      <h2 className="text-lg font-bold text-lagoon">{title}</h2>
      <p className="text-base text-ink-muted">{body}</p>
    </Card>
  );
}
