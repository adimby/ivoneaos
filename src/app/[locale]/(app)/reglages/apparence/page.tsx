import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AppearanceForm } from "@/modules/appearance/components/appearance-form";
import { DEFAULT_APPEARANCE } from "@/modules/appearance/preference";
import { getProfileAppearance } from "@/modules/appearance/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/reglages/apparence">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Appearance" });
  return { title: t("metaTitle") };
}

// Réglages > Apparence : mode et palette de l'application, propres à la personne.
export default async function AppearancePage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  await requireWorkspace(locale);
  const [current, query, t] = await Promise.all([
    getProfileAppearance(),
    searchParams,
    getTranslations({ locale, namespace: "Appearance" }),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-5 md:max-w-3xl">
      <Link href="/reglages" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToSettings")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
      <p className="text-base text-ink-muted">{t("intro")}</p>
      <div aria-live="polite">
        {query.r === "ok" && <Alert tone="success">{t("saved")}</Alert>}
        {query.r === "erreur" && <Alert tone="error">{t("error")}</Alert>}
      </div>
      <AppearanceForm locale={locale} current={current ?? DEFAULT_APPEARANCE} saved={query.r === "ok"} />
    </div>
  );
}
