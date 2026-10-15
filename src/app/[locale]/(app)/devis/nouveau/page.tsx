import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactsIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DocumentForm } from "@/modules/billing/components/document-form";
import { dayIn, newDocumentDefaults } from "@/modules/billing/form-defaults";
import { getDeal, listContactOptions } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/devis/nouveau">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Billing.form" });
  return { title: t("newQuoteTitle") };
}

// Nouveau devis : depuis une opportunité (?deal=, client prérempli et fixe), depuis un
// contact (?contact=, prérempli) ou depuis la liste.
export default async function NewQuotePage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const query = await searchParams;
  const dealParam = typeof query.deal === "string" ? query.deal : undefined;
  const contactParam = typeof query.contact === "string" ? query.contact : undefined;
  const deal = dealParam ? await getDeal(workspace.id, dealParam) : null;
  const activeDeal = deal && !deal.archived_at && !deal.contacts?.archived_at ? deal : null;
  const [{ contacts, total }, t] = await Promise.all([
    listContactOptions(workspace.id, activeDeal?.contact_id ?? contactParam),
    getTranslations({ locale, namespace: "Billing.form" }),
  ]);
  const prefilled = contacts.find((c) => c.id === (activeDeal?.contact_id ?? contactParam));
  const label = (c: { name: string; company_name: string | null }) => (c.company_name ? `${c.name} (${c.company_name})` : c.name);
  const backHref = activeDeal ? `/pipeline/${activeDeal.id}` : "/factures?vue=devis";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href={backHref} className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {activeDeal ? activeDeal.title : t("back")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("newQuoteTitle")}</h1>
      {contacts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <ContactsIcon className="size-10 text-turquoise" />
          <h2 className="text-lg font-bold text-lagoon">{t("noContacts.title")}</h2>
          <p className="text-base text-ink-muted">{t("noContacts.body")}</p>
          <Link href="/contacts/nouveau" className={buttonClasses("primary", true)}>
            {t("noContacts.action")}
          </Link>
        </Card>
      ) : (
        <DocumentForm
          kind="quote"
          back={activeDeal ? `/devis/nouveau?deal=${activeDeal.id}` : "/devis/nouveau"}
          contacts={contacts.map((c) => ({ id: c.id, label: label(c) }))}
          contactsTotal={total}
          fixedContact={activeDeal && prefilled ? { label: label(prefilled), hint: t("client.fixed", { deal: activeDeal.title }) } : undefined}
          defaultCurrency={workspace.default_currency}
          minDate={dayIn(0)}
          defaults={newDocumentDefaults("quote", {
            contactId: prefilled?.id ?? "",
            dealId: activeDeal?.id,
            currency: activeDeal?.currency ?? workspace.default_currency,
            language: locale,
          })}
        />
      )}
    </div>
  );
}
