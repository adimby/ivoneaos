"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonClasses } from "../ui/button";
import { Card } from "../ui/card";
import { Link } from "@/i18n/navigation";

// Erreur inattendue (réseau, base indisponible) : message clair et « Réessayer ».
export function ErrorState({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("Errors");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-4" role="alert">
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
      <Card>
        <p className="text-base text-ink">{t("body")}</p>
      </Card>
      <Button block onClick={() => retry()}>
        {t("retry")}
      </Button>
      <Link href="/tableau-de-bord" className={buttonClasses("ghost", true)}>
        {t("home")}
      </Link>
    </div>
  );
}
