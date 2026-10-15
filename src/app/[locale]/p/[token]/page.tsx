import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { routing, type Locale } from "@/i18n/routing";
import { acceptQuotePublic } from "@/modules/billing/actions";
import { PublicShell } from "@/modules/billing/components/public-shell";
import { getPublicDocument, publicLogoUrl } from "@/modules/billing/queries";
import { STATUS_TONE } from "@/modules/billing/status";
import { documentView } from "@/modules/billing/view";

type Props = PageProps<"/[locale]/p/[token]">;

// Page publique d'un devis ou d'une facture : sans compte, jamais indexée, aucun
// référent transmis aux liens sortants (le jeton reste privé). Aucun composant client :
// le formulaire « J'accepte » fonctionne sans JavaScript (action serveur, <details>).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Public" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
  };
}

export default function PublicDocumentPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<Skeleton />}>
      <PublicDocument params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const RESULTS = ["accepted", "outdated", "unavailable", "error"] as const;

async function PublicDocument({ params, searchParams }: Props) {
  const { locale: rawLocale, token } = await params;
  const locale = rawLocale as Locale;
  const [found, query, t, tDoc] = await Promise.all([
    getPublicDocument(token),
    searchParams,
    getTranslations({ locale, namespace: "Public" }),
    getTranslations({ locale, namespace: "Pdf" }),
  ]);
  // Jeton inconnu ou brouillon : le proxy a déjà répondu 404 (src/proxy.ts) ; ceci ne
  // sert que si le document disparaît entre-temps.
  if (!found) notFound();

  const { doc } = found;
  const view = documentView(doc, { locale, now: new Date(), publicUrl: null });
  const logoUrl = await publicLogoUrl(view.freelancer.logoPath);
  const result = typeof query.r === "string" && (RESULTS as readonly string[]).includes(query.r) ? query.r : null;
  const business = view.freelancer.name;
  const otherLocale = routing.locales.find((l) => l !== locale)!;
  const canAccept = doc.type === "quote" && view.status === "sent" && Boolean(doc.version);
  const statusKey = view.status === "draft" ? null : view.status;

  return (
    <PublicShell
      madeWith={tDoc("madeWith")}
      bottom={
        canAccept && (
          <form
            action={acceptQuotePublic}
            className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-sand/70 bg-spray/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="version" value={doc.type === "quote" ? (doc.version ?? "") : ""} />
            {/* Deux gestes : « J'accepte » ouvre la confirmation (sans JavaScript), un
                toucher accidentel n'engage pas le client. */}
            <p className="mb-2 text-sm text-ink-muted">{t("accept.intro", { total: view.total, business })}</p>
            <details className="group" data-testid="accept">
              <summary
                className={buttonClasses(
                  "primary",
                  true,
                  "cursor-pointer list-none select-none group-open:bg-transparent group-open:text-lagoon group-open:shadow-none group-open:hover:underline [&::-webkit-details-marker]:hidden",
                )}
              >
                <span className="group-open:hidden">{t("accept.button")}</span>
                <span className="hidden group-open:inline">{t("accept.cancel")}</span>
              </summary>
              <p className="mt-2 text-base text-ink">
                {t("accept.confirmIntro", { number: view.number ?? "" })}
              </p>
              <button type="submit" className={buttonClasses("primary", true, "mt-3")}>
                {t("accept.confirm")}
              </button>
            </details>
          </form>
        )
      }
      languageLink={{ href: `/${otherLocale}/p/${token}`, label: otherLocale === "fr" ? "Français" : "English", lang: otherLocale }}
    >
      <header className="flex items-center gap-3">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire du stockage, sans optimisation d'image
          <img src={logoUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-xl bg-white object-contain" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{t("from")}</p>
          <p className="truncate text-lg font-bold text-lagoon">{business}</p>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        {statusKey && (
          <Badge tone={STATUS_TONE[statusKey]} className="self-start" data-testid="public-status">
            {t(`status.${doc.type}.${statusKey}` as "status.quote.sent")}
          </Badge>
        )}
        <h1 className="text-2xl font-bold text-lagoon">
          {tDoc(doc.type === "quote" ? "quoteTitle" : "invoiceTitle")} {view.number}
        </h1>
        <p className="text-3xl font-bold text-ink" data-testid="public-total">
          {view.total}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
          {view.dates.map((d) => (
            <div key={d.key} className="contents">
              <dt className="text-ink-muted">{tDoc(`dates.${d.key}`)}</dt>
              <dd className="text-ink">{d.value}</dd>
            </div>
          ))}
          <dt className="text-ink-muted">{t("to")}</dt>
          <dd className="text-ink">
            {view.client.name}
            {view.client.company && ` · ${view.client.company}`}
          </dd>
        </dl>
      </div>

      {result === "outdated" && <Alert tone="error">{t("accept.outdated")}</Alert>}
      {result === "unavailable" && view.status !== "accepted" && <Alert tone="error">{t("accept.unavailable", { business })}</Alert>}
      {result === "error" && <Alert tone="error">{t("accept.error")}</Alert>}
      {view.status === "accepted" && doc.type === "quote" && doc.accepted_at && (
        <Alert tone="success">{t("accept.done", { date: view.dates.find((d) => d.key === "acceptedAt")?.value ?? "" })}</Alert>
      )}

      <Card aria-labelledby="lines-title" className="flex flex-col gap-3 bg-white">
        <h2 id="lines-title" className="sr-only">
          {tDoc("columns.description")}
        </h2>
        <ul className="flex flex-col divide-y divide-sand/70">
          {view.lines.map((line, i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="text-base break-words text-ink">{line.description}</span>
                <span className="text-sm text-ink-muted">
                  {line.quantity} × {line.unitPrice}
                </span>
              </span>
              <span className="shrink-0 text-base font-semibold text-ink">{line.total}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1 border-t border-sand pt-3 text-base">
          {view.discount && (
            <>
              <div className="flex justify-between text-ink-muted">
                <dt>{tDoc("subtotal")}</dt>
                <dd>{view.subtotal}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>{tDoc("discount")}</dt>
                <dd>− {view.discount}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between text-lg font-bold text-lagoon">
            <dt>{tDoc("total")}</dt>
            <dd>{view.total}</dd>
          </div>
          {view.amountPaid && view.amountDue && (
            <>
              <div className="flex justify-between text-ink-muted">
                <dt>{tDoc("amountPaid")}</dt>
                <dd>{view.amountPaid}</dd>
              </div>
              <div className="flex justify-between font-bold text-ink">
                <dt>{tDoc("amountDue")}</dt>
                <dd>{view.amountDue}</dd>
              </div>
            </>
          )}
        </dl>
      </Card>

      {doc.type === "invoice" && (
        <Card aria-labelledby="payment-title" className="flex flex-col gap-3">
          <h2 id="payment-title" className="text-lg font-bold text-lagoon">
            {t("payment.title")}
          </h2>
          {view.status === "paid" ? (
            <p className="text-base text-success">{t("payment.paid")}</p>
          ) : view.status === "cancelled" ? (
            <p className="text-base text-ink-muted">{t("payment.cancelled")}</p>
          ) : (
            <>
              <p className="text-base text-ink">
                <span className="text-ink-muted">{t("payment.amountDue")} </span>
                <strong>{view.amountDue ?? view.total}</strong>
              </p>
              {/* Lien de paiement en ligne (Papi, MGA) : posé par la base quand il existe. */}
              {view.payment?.linkUrl && (
                <a href={view.payment.linkUrl} rel="noopener noreferrer" className={buttonClasses("primary", true)} data-testid="pay-online">
                  {t("payment.payOnline")}
                </a>
              )}
              {view.payment && view.payment.instructions.length > 0 ? (
                <div data-testid="manual-payment">
                  <p className="text-sm font-semibold text-ink">{t("payment.manual")}</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-base break-words text-ink select-all">
                    {view.payment.instructions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                !view.payment?.linkUrl && <p className="text-base text-ink-muted">{t("payment.none", { business })}</p>
              )}
            </>
          )}
        </Card>
      )}

      <a href={`/${locale}/p/${token}/pdf?telecharger`} className={buttonClasses("secondary", true)} download>
        {t("download")}
      </a>

      <section aria-labelledby="legal-title" className="flex flex-col gap-0.5 text-sm text-ink-muted">
        <h2 id="legal-title" className="font-semibold text-ink">
          {t("legal")}
        </h2>
        <p>{business}</p>
        {view.freelancer.address && <p>{view.freelancer.address}</p>}
        <p>
          {[
            view.freelancer.nif && tDoc("nif", { value: view.freelancer.nif }),
            view.freelancer.stat && tDoc("stat", { value: view.freelancer.stat }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {view.freelancer.taxRegime && <p>{tDoc(`taxRegime.${view.freelancer.taxRegime}`)}</p>}
        {view.freelancer.footer && <p>{view.freelancer.footer}</p>}
      </section>
    </PublicShell>
  );
}

function Skeleton() {
  return (
    <div className="px-safe mx-auto flex w-full max-w-md flex-col gap-4 pt-16" aria-busy="true">
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-sand/60" />
      <div className="h-40 animate-pulse rounded-card bg-sand/40" />
      <div className="h-24 animate-pulse rounded-card bg-sand/40" />
    </div>
  );
}
