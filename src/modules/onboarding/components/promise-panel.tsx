import { getTranslations } from "next-intl/server";
import { ContactsIcon, InvoiceIcon, WalletIcon } from "@/components/icons";

const BENEFITS = [
  { key: "clients", Icon: ContactsIcon },
  { key: "documents", Icon: InvoiceIcon },
  { key: "payments", Icon: WalletIcon },
] as const;

// Démarrage, ordinateur : panneau de gauche qui raconte la promesse (badge, titre, phrase,
// trois bénéfices). Fond discret tiré des jetons du thème (clair, sombre, 6 palettes).
export async function PromisePanel({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "Onboarding.promise" });
  return (
    <aside
      aria-label={t("label")}
      className="relative hidden overflow-hidden border-r border-sand/70 bg-sand-light lg:block"
      data-testid="onboarding-promise"
    >
      <div className="sticky top-0 flex flex-col gap-6 px-10 pt-14 pb-40 xl:px-14 xl:pt-20">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-sand bg-surface px-3 py-1 text-sm font-semibold text-lagoon">
          <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
            <path d="M8 2.5 9.4 6.6 13.5 8 9.4 9.4 8 13.5 6.6 9.4 2.5 8l4.1-1.4ZM15 11l.8 2.2L18 14l-2.2.8L15 17l-.8-2.2L12 14l2.2-.8Z" />
          </svg>
          {t("badge")}
        </span>
        <p className="max-w-md text-4xl leading-tight font-bold tracking-tight text-ink xl:text-5xl">{t("title")}</p>
        <p className="max-w-md text-lg text-ink-muted">{t("intro")}</p>
        <ul className="mt-4 flex max-w-md flex-col gap-6">
          {BENEFITS.map(({ key, Icon }) => (
            <li key={key} className="flex items-start gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-sand/70 bg-surface text-lagoon shadow-card">
                <Icon className="size-6" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold text-ink">{t(`benefits.${key}.title`)}</span>
                <span className="text-base text-ink-muted">{t(`benefits.${key}.text`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      {/* Vagues de la marque, en filigrane. */}
      <svg
        viewBox="0 0 400 120"
        className="pointer-events-none absolute right-0 bottom-0 left-0 w-full text-lagoon opacity-10"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M-10 60c40 0 40-24 80-24s40 24 80 24 40-24 80-24 40 24 80 24 40-24 80-24" />
        <path d="M-10 96c40 0 40-24 80-24s40 24 80 24 40-24 80-24 40 24 80 24 40-24 80-24" />
      </svg>
    </aside>
  );
}
