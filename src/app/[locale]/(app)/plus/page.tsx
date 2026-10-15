import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { MoreMenu } from "@/components/app-shell/bottom-nav";
import { Card } from "@/components/ui/card";

export async function generateMetadata({ params }: PageProps<"/[locale]/plus">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Nav" });
  return { title: t("more") };
}

// Menu « Plus » en page : pour les navigateurs sans API Popover, ou avant le chargement
// du JavaScript (l'onglet « Plus » est alors un simple lien).
export default async function MorePage({ params }: PageProps<"/[locale]/plus">) {
  const { locale } = await params;
  return <MoreContent locale={locale} />;
}

function MoreContent({ locale }: { locale: string }) {
  const t = useTranslations("Nav");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-lagoon">{t("more")}</h1>
      <Card className="p-2">
        <nav aria-label={t("more")}>
          <MoreMenu locale={locale} />
        </nav>
      </Card>
    </div>
  );
}
