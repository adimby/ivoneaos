import type { Locale } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { use } from "react";
import { Brand } from "@/components/brand";
import { LanguageSwitch } from "@/components/language-switch";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

const POINTS = ["crm", "quotes", "pay"] as const;

export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  const t = useTranslations("Home");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="on-dark bg-chrome pt-safe text-on-chrome">
        <div className="px-safe mx-auto flex h-16 w-full max-w-md items-center justify-between md:max-w-3xl md:px-8">
          <Brand />
          <LanguageSwitch current={locale as Locale} href="/" tone="dark" />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="on-dark bg-chrome pb-12 text-on-chrome">
          <div className="px-safe mx-auto flex w-full max-w-md flex-col gap-4 pt-6 md:max-w-3xl md:px-8 md:pt-12">
            <p className="text-sm font-semibold tracking-wide text-on-chrome-muted uppercase">{t("eyebrow")}</p>
            <h1 className="text-4xl leading-tight font-bold text-balance">{t("title")}</h1>
            <p className="text-lg text-on-chrome">{t("subtitle")}</p>
          </div>
        </section>

        <div className="px-safe mx-auto -mt-6 flex w-full max-w-md flex-1 flex-col gap-6 pb-safe md:max-w-3xl md:px-8">
          <ul className="flex flex-col gap-3 rounded-card border border-sand/70 bg-sand-light p-5 shadow-card">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="11" className="fill-turquoise" />
                  <path d="m7.5 12.5 3 3 6-6.5" fill="none" className="stroke-on-turquoise" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-base">{t(`points.${point}`)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-col gap-3 pb-6 md:mt-4 md:items-start">
            <Link href="/connexion" className={buttonClasses("primary", true, "min-h-13 text-lg md:w-auto md:px-8")}>
              {t("cta")}
            </Link>
            <p className="text-center text-sm text-ink-muted md:text-left">{t("ctaHint")}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
