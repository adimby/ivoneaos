import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { parseBrand, brandSnapshot } from "@/modules/branding/brand";
import { BrandingForm } from "@/modules/branding/components/branding-form";
import { getLogoUrl, requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/reglages/image-de-marque">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Branding" });
  return { title: t("metaTitle") };
}

// Réglages > Image de marque : logo, bannière, couleurs, police et pied de page des devis
// et factures (PDF et page client). Offert sur toutes les offres.
export default async function BrandingPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const brand = parseBrand(brandSnapshot(workspace));
  const [logoUrl, bannerUrl, t] = await Promise.all([
    getLogoUrl(workspace.logo_path),
    getLogoUrl(brand.bannerPath),
    getTranslations({ locale, namespace: "Branding" }),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-5 lg:max-w-5xl">
      <Link href="/reglages" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToSettings")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
      <p className="text-base text-ink-muted md:max-w-2xl">{t("intro")}</p>
      <BrandingForm
        locale={locale}
        defaults={{ ...brand, footer: workspace.invoice_footer ?? "" }}
        logoUrl={logoUrl}
        logoIsWebp={Boolean(workspace.logo_path?.endsWith(".webp"))}
        bannerUrl={bannerUrl}
        businessName={workspace.name}
        sampleYear={new Date().getFullYear()}
      />
    </div>
  );
}
