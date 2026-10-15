import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { PublicShell } from "@/modules/billing/components/public-shell";

// Jeton inconnu ou document encore en brouillon : réponse 404, rien n'est révélé.
export default function PublicDocumentNotFound() {
  const t = useTranslations("Public");
  const tDoc = useTranslations("Pdf");
  return (
    <PublicShell madeWith={tDoc("madeWith")}>
      <h1 className="text-2xl font-bold text-lagoon">{t("notFound.title")}</h1>
      <Card>
        <p className="text-base text-ink">{t("notFound.body")}</p>
      </Card>
    </PublicShell>
  );
}
