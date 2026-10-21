import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ContactForm, EMPTY_CONTACT } from "@/modules/crm/components/contact-form";
import { countryList } from "@/modules/crm/countries";
import { getFavouriteCountries } from "@/modules/crm/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/contacts/nouveau">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contacts" });
  return { title: t("newTitle") };
}

export default async function NewContactPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const [t, favourites] = await Promise.all([
    getTranslations({ locale, namespace: "Contacts" }),
    getFavouriteCountries(workspace.id),
  ]);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href="/contacts" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToList")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("newTitle")}</h1>
      <ContactForm
        defaults={EMPTY_CONTACT}
        back="/contacts/nouveau"
        countries={countryList(locale)}
        favouriteCountries={favourites}
      />
    </div>
  );
}
