import { useTranslations } from "next-intl";
import { PlainPage } from "@/components/app-shell/plain-page";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

// Page introuvable, dans la langue de l'URL.
export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <PlainPage>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
        <Card>
          <p className="text-base text-ink">{t("body")}</p>
        </Card>
        <Link href="/" className={buttonClasses("primary", true)}>
          {t("home")}
        </Link>
      </div>
    </PlainPage>
  );
}
