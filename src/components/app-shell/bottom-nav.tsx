"use client";

import { useRef, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { signOut } from "@/modules/auth/actions";
import {
  ContactsIcon,
  HomeIcon,
  InvoiceIcon,
  MoreIcon,
  PipelineIcon,
  SettingsIcon,
  SignOutIcon,
} from "../icons";
import { cn } from "../ui/cn";

const TABS = [
  { href: "/tableau-de-bord", label: "home", Icon: HomeIcon },
  { href: "/pipeline", label: "pipeline", Icon: PipelineIcon },
  // Devis et factures : le même onglet.
  { href: "/factures", label: "invoices", Icon: InvoiceIcon, also: "/devis" },
] as const;

const MORE = [
  { href: "/contacts", label: "contacts", Icon: ContactsIcon },
  { href: "/reglages", label: "settings", Icon: SettingsIcon },
] as const;

const tabClass =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold";

const noSubscribe = () => () => {};
const popoverSupported = () => typeof HTMLElement.prototype.showPopover === "function";

// Téléphone et tablette (sous lg) : barre d'onglets en bas (à portée du pouce) ; sur
// ordinateur, display: none, la navigation de gauche (side-nav.tsx) la remplace. « Plus » est d'abord un lien vers la page
// /plus (marche partout, même sans JavaScript ni API Popover) ; une fois la page chargée,
// si le navigateur connaît l'API Popover, il ouvre un menu sur place.
export function BottomNav({ locale }: { locale: string }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const menu = useRef<HTMLDivElement>(null);
  const withPopover = useSyncExternalStore(noSubscribe, popoverSupported, () => false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = isActive("/plus") || MORE.some((item) => isActive(item.href));
  const moreContent = (
    <>
      <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-white/15")}>
        <MoreIcon className="size-6" />
      </span>
      {t("more")}
    </>
  );

  return (
    <>
    <nav aria-label={t("label")} data-testid="bottom-nav" className="on-dark fixed inset-x-0 bottom-0 z-20 bg-lagoon pb-safe text-sand shadow-[0_-4px_16px_rgb(11_42_46/0.15)] lg:hidden">
      <ul className="px-safe mx-auto flex max-w-md gap-1 py-1">
        {TABS.map((tab) => {
          const { href, label, Icon } = tab;
          const active = isActive(href) || ("also" in tab && isActive(tab.also));
          return (
            <li key={href} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(tabClass, active ? "text-white" : "hover:text-white")}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", active && "bg-white/15")}>
                  <Icon className="size-6" />
                </span>
                {t(label)}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          {withPopover ? (
            <button
              type="button"
              popoverTarget="plus-menu"
              className={cn(tabClass, moreActive ? "text-white" : "hover:text-white")}
            >
              {moreContent}
            </button>
          ) : (
            <Link
              href="/plus"
              aria-current={isActive("/plus") ? "page" : undefined}
              className={cn(tabClass, moreActive ? "text-white" : "hover:text-white")}
            >
              {moreContent}
            </Link>
          )}
        </li>
      </ul>
    </nav>

      {withPopover && (
        <div
          ref={menu}
          id="plus-menu"
          popover="auto"
          className="fixed inset-x-3 top-auto bottom-[calc(4.5rem+env(safe-area-inset-bottom))] m-0 mx-auto w-auto max-w-md rounded-card border border-sand bg-white p-2 text-ink shadow-card backdrop:bg-ink/30 lg:hidden"
        >
          <nav aria-label={t("more")}>
            <MoreMenu locale={locale} isActive={isActive} onNavigate={() => menu.current?.hidePopover()} />
          </nav>
        </div>
      )}
    </>
  );
}

// Contenu du menu « Plus » : popover de la barre d'onglets et page /plus.
export function MoreMenu({
  locale,
  isActive,
  onNavigate,
}: {
  locale: string;
  isActive?: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("Nav");
  return (
    <ul className="flex flex-col">
      {MORE.map(({ href, label, Icon }) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={isActive?.(href) ? "page" : undefined}
            onClick={onNavigate}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold hover:bg-sand-light aria-[current=page]:text-lagoon"
          >
            <Icon className="size-5 text-turquoise" />
            {t(label)}
          </Link>
        </li>
      ))}
      <li className="mt-1 border-t border-sand pt-1">
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-semibold hover:bg-sand-light"
          >
            <SignOutIcon className="size-5 text-turquoise" />
            {t("signOut")}
          </button>
        </form>
      </li>
    </ul>
  );
}
