import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: PageProps<"/[locale]/reglages/paiements">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Payments" });
  return { title: t("metaTitle") };
}

// Emplacement de la connexion Papi (étape « Papi »).
export default function PaymentsPage() {
  const t = useTranslations("Payments");
  return (
    <div className="flex flex-col gap-4">
      <Link href="/reglages" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToSettings")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
      <Card>
        <p className="text-base text-ink-muted">{t("body")}</p>
      </Card>
    </div>
  );
}
