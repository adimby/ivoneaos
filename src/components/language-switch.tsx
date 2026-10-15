import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "./ui/cn";

// Choix de la langue par lien (sans JavaScript) : même page, autre langue.
export function LanguageSwitch({
  current,
  href,
  tone = "light",
}: {
  current: Locale;
  href: string;
  tone?: "light" | "dark";
}) {
  const t = useTranslations("Common");
  return (
    <nav aria-label={t("languageLabel")}>
      <ul className="flex gap-1">
        {routing.locales.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href={href}
                locale={locale}
                hrefLang={locale}
                lang={locale}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-semibold",
                  tone === "dark"
                    ? active
                      ? "bg-white/15 text-white"
                      : "text-sand hover:text-white"
                    : active
                      ? "bg-lagoon text-white"
                      : "text-lagoon hover:bg-sand-light",
                )}
              >
                {t(`languages.${locale}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
