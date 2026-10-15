import { useTranslations } from "next-intl";
import { Card } from "../ui/card";

export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations("Placeholder");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-lagoon">{title}</h1>
      <Card>
        <p className="text-base text-ink-muted">{t("body")}</p>
      </Card>
    </div>
  );
}
