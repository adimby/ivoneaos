import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 px-4 py-12 mx-auto w-full max-w-md">
      <p className="text-sm font-semibold tracking-wide">Ivonea OS</p>
      <h1 className="text-3xl font-semibold leading-tight">{t("title")}</h1>
      <p className="text-base opacity-80">{t("subtitle")}</p>
      <span className="self-start rounded-lg border px-4 py-3 text-sm font-medium">
        {t("cta")}
      </span>
    </main>
  );
}
