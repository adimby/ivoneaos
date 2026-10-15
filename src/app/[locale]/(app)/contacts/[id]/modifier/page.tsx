import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ContactForm } from "@/modules/crm/components/contact-form";
import { countryOptions } from "@/modules/crm/constants";
import { getContact } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/contacts/[id]/modifier">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contacts" });
  return { title: t("editTitle") };
}

export default async function EditContactPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const [contact, t] = await Promise.all([getContact(workspace.id, id), getTranslations({ locale, namespace: "Contacts" })]);
  if (!contact) notFound();
  // Archivé : non modifiable, la fiche propose de le désarchiver.
  if (contact.archived_at) redirect({ href: `/contacts/${contact.id}`, locale });

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href={`/contacts/${contact.id}`} className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToContact")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("editTitle")}</h1>
      <ContactForm
        back={`/contacts/${contact.id}/modifier`}
        countries={countryOptions(locale)}
        defaults={{
          id: contact.id,
          name: contact.name,
          phone: contact.phone ?? "",
          email: contact.email ?? "",
          company_name: contact.company_name ?? "",
          kind: contact.kind,
          country: contact.country,
          tags: contact.tags,
        }}
      />
    </div>
  );
}
