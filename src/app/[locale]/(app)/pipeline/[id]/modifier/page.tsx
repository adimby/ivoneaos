import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { amountInputValue, type Currency } from "@/lib/money";
import { DealForm } from "@/modules/crm/components/deal-form";
import { getDeal } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/pipeline/[id]/modifier">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Deals" });
  return { title: t("editTitle") };
}

export default async function EditDealPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const [deal, t] = await Promise.all([getDeal(workspace.id, id), getTranslations({ locale, namespace: "Deals" })]);
  if (!deal) notFound();
  // Opportunité ou contact archivés : consultation seule, la fiche propose de désarchiver.
  if (deal.archived_at || deal.contacts?.archived_at) redirect({ href: `/pipeline/${deal.id}`, locale });
  // Le contact ne change pas en modification (affiché seulement).
  const contact = deal.contacts;

  return (
    <div className="flex flex-1 flex-col gap-5 md:max-w-2xl">
      <Link href={`/pipeline/${deal.id}`} className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToDeal")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("editTitle")}</h1>
      <DealForm
        back={`/pipeline/${deal.id}/modifier`}
        contacts={contact ? [{ id: contact.id, label: contact.company_name ? `${contact.name} (${contact.company_name})` : contact.name }] : []}
        defaults={{
          id: deal.id,
          title: deal.title,
          contact_id: deal.contact_id,
          currency: deal.currency,
          amount: deal.amount === null ? "" : amountInputValue(deal.amount, deal.currency as Currency),
          expected_close_on: deal.expected_close_on ?? "",
        }}
      />
    </div>
  );
}
