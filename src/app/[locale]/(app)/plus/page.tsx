import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { MoreMenu } from "@/components/app-shell/bottom-nav";
import { Card } from "@/components/ui/card";
import { isPlatformAdmin } from "@/modules/verification/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/plus">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Nav" });
  return { title: t("more") };
}

// Menu « Plus » en page : pour les navigateurs sans API Popover, ou avant le chargement
// du JavaScript (l'onglet « Plus » est alors un simple lien). Ordinateur : la navigation de
// gauche contient déjà tout, la page le dit au lieu de répéter le menu (lien gardé ou
// fenêtre agrandie).
export default async function MorePage({ params }: PageProps<"/[locale]/plus">) {
  const { locale } = await params;
  return <MoreContent locale={locale} isAdmin={await isPlatformAdmin()} />;
}

function MoreContent({ locale, isAdmin }: { locale: string; isAdmin: boolean }) {
  const t = useTranslations("Nav");
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold text-lagoon">{t("more")}</h1>
      <p className="hidden text-base text-ink-muted lg:block">{t("moreInSidebar")}</p>
      <Card className="p-2 lg:hidden">
        <nav aria-label={t("more")}>
          <MoreMenu locale={locale} isAdmin={isAdmin} />
        </nav>
      </Card>
    </div>
  );
}
