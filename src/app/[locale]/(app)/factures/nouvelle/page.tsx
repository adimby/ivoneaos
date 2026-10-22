import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactsIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DocumentForm } from "@/modules/billing/components/document-form";
import { dayIn, newDocumentDefaults } from "@/modules/billing/form-defaults";
import { listContactOptions } from "@/modules/crm/queries";
import { FiscalVerificationPanel } from "@/modules/verification/components/fiscal-verification-panel";
import { getFiscalState } from "@/modules/verification/queries";
import { FiscalInfoBlock } from "@/modules/workspace/components/fiscal-info-block";
import { fiscalDefaults, hasFiscalInfo } from "@/modules/workspace/profile-schema";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/factures/nouvelle">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Billing.form" });
  return { title: t("newInvoiceTitle") };
}

// Nouvelle facture sans devis (?contact= : client prérempli).
export default async function NewInvoicePage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const query = await searchParams;
  const contactParam = typeof query.contact === "string" ? query.contact : undefined;
  const fiscalComplete = hasFiscalInfo(workspace);
  const [{ contacts, total }, fiscal, t] = await Promise.all([
    listContactOptions(workspace.id, contactParam),
    fiscalComplete ? getFiscalState(workspace) : null,
    getTranslations({ locale, namespace: "Billing.form" }),
  ]);
  const prefilled = contacts.find((c) => c.id === contactParam);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href="/factures" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("newInvoiceTitle")}</h1>
      {/* Formulaire à part, replié : le brouillon s'enregistre sans données fiscales (demandées
          à l'envoi) ; l'enregistrement ne vide pas la facture en cours de saisie. */}
      <FiscalInfoBlock
        locale={locale}
        back="/factures/nouvelle"
        missing={!fiscalComplete}
        defaults={fiscalDefaults(workspace)}
        fiscalStatus={workspace.fiscal_status}
        compact
      />
      {fiscal && <FiscalVerificationPanel workspaceId={workspace.id} state={fiscal} hasNumbers locale={locale} context="invoice" compact />}
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
          kind="invoice"
          back="/factures/nouvelle"
          contacts={contacts.map((c) => ({ id: c.id, label: c.company_name ? `${c.name} (${c.company_name})` : c.name }))}
          contactsTotal={total}
          defaultCurrency={workspace.default_currency}
          minDate={dayIn(0)}
          defaults={newDocumentDefaults("invoice", {
            contactId: prefilled?.id ?? "",
            currency: workspace.default_currency,
            language: locale,
          })}
        />
      )}
    </div>
  );
}
