"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { setLanguage, signOut } from "@/modules/auth/actions";
import { Brand } from "../brand";
import { ContactsIcon, HomeIcon, InvoiceIcon, PipelineIcon, SettingsIcon, SignOutIcon } from "../icons";
import { cn } from "../ui/cn";

const ITEMS = [
  { href: "/tableau-de-bord", label: "dashboard", Icon: HomeIcon },
  { href: "/pipeline", label: "pipeline", Icon: PipelineIcon },
  { href: "/factures", label: "billing", Icon: InvoiceIcon, also: "/devis" },
  { href: "/contacts", label: "contacts", Icon: ContactsIcon },
  { href: "/reglages", label: "settings", Icon: SettingsIcon },
] as const;

const itemClass = "flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold";

// Ordinateur (lg et plus) : navigation fixe à gauche, à la place de l'en-tête, de la barre
// d'onglets et du menu « Plus ». En dessous de lg, display: none (hidden) : une seule
// navigation principale exposée à la fois, aux lecteurs d'écran comme à l'œil.
export function SideNav({ locale }: { locale: Locale }) {
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div
      data-testid="side-nav"
      className="on-dark fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 overflow-y-auto bg-chrome px-4 pt-6 pb-5 text-on-chrome-muted lg:flex"
    >
      <Link href="/tableau-de-bord" className="self-start rounded-lg px-2 text-on-chrome">
        <Brand />
      </Link>

      <nav aria-label={t("label")} className="flex flex-1 flex-col">
        <ul className="flex flex-col gap-1">
          {ITEMS.map((item) => {
            const { href, label, Icon } = item;
            const active = isActive(href) || ("also" in item && isActive(item.also));
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(itemClass, active ? "bg-on-chrome/15 text-on-chrome" : "hover:bg-on-chrome/10 hover:text-on-chrome")}
                >
                  <Icon className="size-5 shrink-0" />
                  {t(label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 border-t border-on-chrome/15 pt-4">
        {/* Langue enregistrée dans le profil, retour sur la même page (avec ses paramètres,
            par exemple ?vue=devis). */}
        <form action={setLanguage} aria-label={tCommon("languageLabel")} className="flex gap-1">
          <input type="hidden" name="current" value={locale} />
          <Suspense fallback={<input type="hidden" name="back" value={pathname} />}>
            <BackInput pathname={pathname} />
          </Suspense>
          {routing.locales.map((value) => (
            <button
              key={value}
              type="submit"
              name="locale"
              value={value}
              lang={value}
              aria-pressed={value === locale}
              className="min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold hover:text-on-chrome aria-pressed:bg-on-chrome/15 aria-pressed:text-on-chrome"
            >
              {tCommon(`languages.${value}`)}
            </button>
          ))}
        </form>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className={cn(itemClass, "w-full hover:bg-on-chrome/10 hover:text-on-chrome")}>
            <SignOutIcon className="size-5 shrink-0" />
            {t("signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

// Page actuelle avec sa chaîne de requête (setLanguage la valide avec safeNextPath).
function BackInput({ pathname }: { pathname: string }) {
  const query = useSearchParams().toString();
  return <input type="hidden" name="back" value={query ? `${pathname}?${query}` : pathname} />;
}
