import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DocumentForm } from "@/modules/billing/components/document-form";
import { dayIn, quoteDefaults } from "@/modules/billing/form-defaults";
import { getQuote } from "@/modules/billing/queries";
import { getContact } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/devis/[id]/modifier">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Billing.form" });
  return { title: t("editQuoteTitle") };
}

// Brouillon, devis envoyé (pas encore accepté) ou expiré (nouvelle validité avant renvoi).
export default async function EditQuotePage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const quote = await getQuote(workspace.id, id);
  if (!quote) notFound();
  if (quote.status === "accepted" || quote.status === "declined") return redirect({ href: `/devis/${id}`, locale });
  const [contact, t] = await Promise.all([
    getContact(workspace.id, quote.contact_id),
    getTranslations({ locale, namespace: "Billing.form" }),
  ]);
  const label = contact ? (contact.company_name ? `${contact.name} (${contact.company_name})` : contact.name) : "";

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href={`/devis/${id}`} className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("editQuoteTitle")}</h1>
      <DocumentForm
        kind="quote"
        back={`/devis/${id}/modifier`}
        contacts={[]}
        fixedContact={{ label, hint: t("client.fixedEdit") }}
        defaultCurrency={workspace.default_currency}
        minDate={dayIn(0)}
        sentWarning={quote.status === "sent"}
        defaults={quoteDefaults(quote, locale)}
      />
    </div>
  );
}
