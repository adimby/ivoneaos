import { useTranslations } from "next-intl";
import { SignOutIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { routing, type Locale } from "@/i18n/routing";
import { setLanguage, signOut } from "../actions";

const darkButton =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-semibold " +
  "text-on-chrome-muted hover:text-on-chrome aria-pressed:bg-on-chrome/15 aria-pressed:text-on-chrome";

// En-tête sombre (accueil guidé) : langue (enregistrée dans le profil) et déconnexion,
// en formulaires d'actions serveur (sans JavaScript). back : page où revenir.
export function AccountControls({ locale, back }: { locale: Locale; back: string }) {
  const t = useTranslations("Common");
  const tNav = useTranslations("Nav");
  return (
    <div className="flex items-center gap-1">
      <form action={setLanguage} aria-label={t("languageLabel")} className="flex">
        <input type="hidden" name="current" value={locale} />
        <input type="hidden" name="back" value={back} />
        {routing.locales.map((value) => (
          <button
            key={value}
            type="submit"
            name="locale"
            value={value}
            lang={value}
            aria-pressed={value === locale}
            className={darkButton}
          >
            <span aria-hidden="true">{value.toUpperCase()}</span>
            <span className="sr-only">{t(`languages.${value}`)}</span>
          </button>
        ))}
      </form>
      <form action={signOut}>
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className={cn(darkButton, "gap-1.5")}>
          <SignOutIcon className="size-5" />
          <span className="sr-only">{tNav("signOut")}</span>
        </button>
      </form>
    </div>
  );
}
