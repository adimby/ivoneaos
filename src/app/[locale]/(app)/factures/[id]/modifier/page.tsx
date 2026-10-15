import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DocumentForm } from "@/modules/billing/components/document-form";
import { dayIn, invoiceDefaults } from "@/modules/billing/form-defaults";
import { getInvoice } from "@/modules/billing/queries";
import { getContact } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/factures/[id]/modifier">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Billing.form" });
  return { title: t("editInvoiceTitle") };
}

// Une facture ne se modifie qu'en brouillon : émise, elle est figée (règle en base).
export default async function EditInvoicePage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const invoice = await getInvoice(workspace.id, id);
  if (!invoice) notFound();
  if (invoice.status !== "draft") return redirect({ href: `/factures/${id}`, locale });
  const [contact, t] = await Promise.all([
    getContact(workspace.id, invoice.contact_id),
    getTranslations({ locale, namespace: "Billing.form" }),
  ]);
  const label = contact ? (contact.company_name ? `${contact.name} (${contact.company_name})` : contact.name) : "";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href={`/factures/${id}`} className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("editInvoiceTitle")}</h1>
      <DocumentForm
        kind="invoice"
        back={`/factures/${id}/modifier`}
        contacts={[]}
        fixedContact={{ label, hint: t("client.fixedEdit") }}
        defaultCurrency={workspace.default_currency}
        minDate={dayIn(0)}
        defaults={invoiceDefaults(invoice, locale)}
      />
    </div>
  );
}
