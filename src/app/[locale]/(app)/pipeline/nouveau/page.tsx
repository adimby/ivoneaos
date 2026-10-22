import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactsIcon } from "@/components/icons";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DealForm } from "@/modules/crm/components/deal-form";
import { listContactOptions, listStages } from "@/modules/crm/queries";
import { stageLabel } from "@/modules/crm/stage-label";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/pipeline/nouveau">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Deals" });
  return { title: t("newTitle") };
}

// Nouvelle opportunité, depuis le pipeline ou depuis un contact (?contact=, prérempli).
export default async function NewDealPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const query = await searchParams;
  const prefilled = typeof query.contact === "string" ? query.contact : undefined;
  const [{ contacts, total: contactsTotal }, stages, t, tAll] = await Promise.all([
    // Le contact prérempli est toujours proposé, même au-delà de la liste limitée.
    listContactOptions(workspace.id, prefilled),
    listStages(workspace.id),
    getTranslations({ locale, namespace: "Deals" }),
    getTranslations({ locale }),
  ]);
  const fromContact = contacts.find((c) => c.id === prefilled);
  // Gagné et perdu ne se choisissent pas ici : ils se confirment depuis l'opportunité.
  const openStages = stages.filter((s) => s.kind === "open");
  const backHref = fromContact ? `/contacts/${fromContact.id}` : "/pipeline";

  return (
    <div className="flex flex-1 flex-col gap-5 md:max-w-2xl">
      <Link href={backHref} className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {fromContact ? fromContact.name : t("backToPipeline")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("newTitle")}</h1>
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
        <DealForm
          back={fromContact ? `/pipeline/nouveau?contact=${fromContact.id}` : "/pipeline/nouveau"}
          contacts={contacts.map((c) => ({ id: c.id, label: c.company_name ? `${c.name} (${c.company_name})` : c.name }))}
          contactsTotal={contactsTotal}
          stages={openStages.map((s) => ({ id: s.id, label: stageLabel(tAll, s.name) }))}
          defaults={{
            title: "",
            contact_id: fromContact?.id ?? "",
            stage_id: openStages[0]?.id ?? "",
            currency: workspace.default_currency,
            amount: "",
            expected_close_on: "",
          }}
        />
      )}
    </div>
  );
}
