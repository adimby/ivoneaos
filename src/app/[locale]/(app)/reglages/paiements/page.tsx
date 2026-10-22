import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDay } from "@/modules/billing/view";
import { localDate } from "@/lib/time";
import { connectPapiAccount, connectWhopAccount, disconnectPapiAccount } from "@/modules/payments/actions";
import { papiConnectEnabled } from "@/modules/payments/papi/service";
import { getPapiAccount, getWhopAccount } from "@/modules/payments/queries";
import { platformFeePercent } from "@/modules/payments/whop/adapter";
import { whopEnabled } from "@/modules/payments/whop/service";
import { getManualPayment, requireWorkspace } from "@/modules/workspace/queries";
import { formatMvola } from "@/modules/workspace/manual-instructions";

type Props = PageProps<"/[locale]/reglages/paiements">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Payments" });
  return { title: t("metaTitle") };
}

const RESULTS = [
  "connected",
  "disconnected",
  "invalid_key",
  "invalid_key_format",
  "invalid_secret",
  "unavailable",
  "disabled",
  "error",
] as const;
type Result = (typeof RESULTS)[number];
const WHOP_RESULTS = ["connected", "pending", "expired", "unavailable", "disabled", "error"] as const;
type WhopResult = (typeof WHOP_RESULTS)[number];

const PAPI_DASHBOARD = "https://dashboard.papi.mg";

// Parcours P2 : guide pas à pas, clé et secret collés, vérification auprès de Papi.
// Aucun JavaScript nécessaire (formulaires d'action serveur, <details>).
export default async function PaymentsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const whop = whopEnabled();
  const [account, whopAccount, manual, query, t] = await Promise.all([
    getPapiAccount(workspace.id),
    whop ? getWhopAccount(workspace.id) : null,
    getManualPayment(workspace.id),
    searchParams,
    getTranslations({ locale, namespace: "Payments" }),
  ]);
  const result = typeof query.papi === "string" && (RESULTS as readonly string[]).includes(query.papi) ? (query.papi as Result) : null;
  const whopResult =
    whop && typeof query.whop === "string" && (WHOP_RESULTS as readonly string[]).includes(query.whop) ? (query.whop as WhopResult) : null;
  const connected = account?.status === "connected";
  // Clé refusée par Papi depuis la connexion (révoquée, régénérée) : à reconnecter.
  const needsReconnect = account?.status === "error";
  const enabled = papiConnectEnabled();
  const hidden = <input type="hidden" name="locale" value={locale} />;
  const steps = ["account", "shop", "key", "secret", "paste"] as const;

  const fields = (
    <>
      {hidden}
      <Field id="api_key" label={t("form.apiKey")} hint={t("form.apiKeyHint")}>
        {(c) => (
          <Input
            {...c}
            name="api_key"
            type="password"
            required
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={result === "invalid_key" || result === "invalid_key_format" ? true : undefined}
          />
        )}
      </Field>
      <Field id="signing_secret" label={t("form.secret")} hint={t("form.secretHint")}>
        {(c) => (
          <Input
            {...c}
            name="signing_secret"
            type="password"
            required
            placeholder="pwhsec_…"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={result === "invalid_secret" ? true : undefined}
          />
        )}
      </Field>
      <p className="text-sm text-ink-muted">{t("form.privacy")}</p>
    </>
  );

  const manualCard = (
    <Card aria-labelledby="manual-title" className="flex flex-col gap-2">
      <h2 id="manual-title" className="text-lg font-bold text-lagoon">
        {t("manual.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("manual.intro")}</p>
      {manual.mvola || manual.rib || manual.other ? (
        <ul className="flex flex-col gap-0.5 text-base break-words text-ink" data-testid="manual-coordinates">
          {manual.mvola && <li>{t("manual.mvola", { number: formatMvola(manual.mvola) })}</li>}
          {manual.rib && <li>{t("manual.rib", { rib: manual.rib })}</li>}
          {manual.other && <li>{manual.other}</li>}
        </ul>
      ) : (
        <p className="text-base text-ink">{t("manual.none")}</p>
      )}
      <Link href="/reglages#profile-title" className="self-start text-base font-semibold text-lagoon underline-offset-4 hover:underline">
        {t("manual.edit")}
      </Link>
    </Card>
  );

  const guide = (
    <section aria-labelledby="guide-title" className="flex flex-col gap-3">
      <h2 id="guide-title" className="text-lg font-bold text-lagoon">
        {t("guide.title")}
      </h2>
      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lagoon text-sm font-bold text-white"
            >
              {index + 1}
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-ink">{t(`guide.steps.${step}.title`)}</p>
              <p className="text-sm text-ink-muted">{t(`guide.steps.${step}.body`)}</p>
              {step === "account" && (
                <a
                  href={PAPI_DASHBOARD}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon underline underline-offset-4"
                >
                  {t("guide.openPapi")}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );

  // Paiement par carte (Whop) : seulement si WHOP_API_KEY est configurée.
  const whopConnected = whopAccount?.status === "connected";
  const whopCard = whop && (
    <Card aria-labelledby="whop-title" className="flex flex-col gap-3" data-testid="whop-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="whop-title" className="text-lg font-bold text-lagoon">
          {t("whop.title")}
        </h2>
        <Badge tone={whopConnected ? "success" : "neutral"} data-testid="whop-status">
          {whopConnected ? t("whop.connected") : whopAccount ? t("whop.pending") : t("status.notConnected")}
        </Badge>
      </div>
      <p className="text-base text-ink" data-testid="whop-intro">
        {t("whop.intro", { fee: platformFeePercent() })}
      </p>
      {!whopConnected && (
        <form action={connectWhopAccount}>
          {hidden}
          <SubmitButton variant={whopAccount ? "secondary" : "primary"} block>
            {whopAccount ? t("whop.resume") : t("whop.connect")}
          </SubmitButton>
        </form>
      )}
      {/* Vérification d'identité validée plus tard par Whop : statut relu à la demande. */}
      {whopAccount && !whopConnected && (
        <a
          href={`/${locale}/reglages/paiements/whop`}
          className="inline-flex min-h-11 items-center self-center text-base font-semibold text-lagoon underline underline-offset-4"
          data-testid="whop-check-status"
        >
          {t("whop.checkStatus")}
        </a>
      )}
    </Card>
  );

  return (
    <div className="flex flex-1 flex-col gap-5 md:max-w-3xl">
      <Link href="/reglages" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToSettings")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>

      {result && (
        <Alert tone={result === "connected" || result === "disconnected" ? "success" : "error"}>{t(`results.${result}`)}</Alert>
      )}
      {whopResult && (
        <Alert tone={whopResult === "connected" ? "success" : whopResult === "pending" ? "info" : "error"}>
          {t(`whop.results.${whopResult}`)}
        </Alert>
      )}

      <Card aria-labelledby="papi-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="papi-title" className="text-lg font-bold text-lagoon">
            Papi
          </h2>
          <Badge tone={connected ? "success" : "neutral"} data-testid="papi-status">
            {connected ? t("status.connected") : needsReconnect ? t("status.needsReconnect") : t("status.notConnected")}
          </Badge>
        </div>
        <p className="text-base text-ink">{t("papi.intro")}</p>
        {needsReconnect && (
          <p role="note" className="rounded-xl bg-turquoise-soft px-4 py-3 text-sm font-medium text-ink" data-testid="papi-reconnect">
            {t("papi.needsReconnect")}
          </p>
        )}
        {connected && account?.last_checked_at && (
          <p className="text-sm text-ink-muted">
            {t("papi.checkedOn", { date: formatDay(localDate(new Date(account.last_checked_at)), locale) })}
          </p>
        )}
        {(connected || needsReconnect) && (
          <details className="group">
            <summary className={buttonClasses("danger", false, "cursor-pointer list-none px-0 [&::-webkit-details-marker]:hidden")}>
              {t("papi.disconnect")}
            </summary>
            <form action={disconnectPapiAccount} className="mt-2 flex flex-col gap-2">
              {hidden}
              <p className="text-sm text-ink">{t("papi.disconnectConfirm")}</p>
              <SubmitButton variant="secondary" block>
                {t("papi.disconnectOk")}
              </SubmitButton>
            </form>
          </details>
        )}
      </Card>

      {whopCard}

      {!enabled ? (
        <>
          <Alert tone="error">{t("disabled")}</Alert>
          {manualCard}
        </>
      ) : connected ? (
        <>
          {manualCard}
          {/* Clé remplacée (autre boutique, clé régénérée) : même vérification. */}
          <details className="rounded-card border border-sand/70 bg-white p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold text-lagoon [&::-webkit-details-marker]:hidden">
              {t("guide.titleReplace")}
            </summary>
            <form action={connectPapiAccount} className="mt-3 flex flex-col gap-4" data-testid="papi-form">
              <p className="text-sm text-ink-muted">{t("guide.replaceHint")}</p>
              {guide}
              {fields}
              <SubmitButton block>{t("form.replace")}</SubmitButton>
            </form>
          </details>
        </>
      ) : (
        // Formulaire dès le haut de la page : le bouton reste collé en bas de l'écran,
        // à portée du pouce, pendant la lecture du guide.
        <form action={connectPapiAccount} className="flex flex-1 flex-col gap-5" data-testid="papi-form">
          {manualCard}
          {guide}
          {fields}
          <BottomBar>
            <SubmitButton block>{t("form.connect")}</SubmitButton>
          </BottomBar>
        </form>
      )}
    </div>
  );
}
