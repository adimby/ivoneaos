import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/app-shell/coming-soon";

export async function generateMetadata({ params }: PageProps<"/[locale]/pipeline">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Placeholder" });
  return { title: t("pipeline") };
}

// À venir (étapes suivantes) ; la coquille et la garde d'accès sont déjà en place.
export default function Page() {
  const t = useTranslations("Placeholder");
  return <ComingSoon title={t("pipeline")} />;
}
