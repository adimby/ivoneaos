import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { FiscalState } from "../queries";
import { FiscalDocumentsForm } from "./fiscal-documents-form";

// Une carte vérifiée il y a moins de 10 minutes : la confirmation reste visible sur les
// pages de facture (le dépôt vient de se terminer et la page s'est mise à jour).
const JUST_VERIFIED_MS = 10 * 60 * 1000;

// État de la vérification de la carte fiscale, compteur de factures et dépôt des photos.
// Réglages (context « settings ») : toujours affiché en entier. Pages de facture
// (« invoice ») : seulement tant que la carte n'est pas vérifiée (ou vient de l'être), et
// en une ligne discrète (compteur + lien vers le dépôt dans Réglages) tant qu'il reste des
// factures ; plafond atteint (et pas compact) : le bloc complet avec le dépôt remplace le
// bouton d'envoi.
export async function FiscalVerificationPanel({
  workspaceId,
  state,
  hasNumbers,
  locale,
  context,
  compact = false,
}: {
  workspaceId: string;
  state: FiscalState;
  // NIF et STAT renseignés (la lecture les compare à la carte).
  hasNumbers: boolean;
  locale: string;
  context: "settings" | "invoice";
  // Page de facture : toujours la ligne discrète (nouvelle facture, rien à envoyer ici).
  compact?: boolean;
}) {
  const t = await getTranslations({ locale, namespace: "Verification" });
  const date = state.at
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Indian/Antananarivo" }).format(new Date(state.at))
    : null;

  if (state.status === "verified") {
    const recent = state.at !== null && new Date().getTime() - new Date(state.at).getTime() < JUST_VERIFIED_MS;
    if (context === "invoice" && !recent) return null;
    return (
      <section
        id="verification-fiscale"
        aria-labelledby="verification-title"
        className="flex scroll-mt-20 flex-col gap-3 rounded-card border border-sand/70 bg-sand-light p-4 shadow-card"
        data-testid="fiscal-verification"
        data-status="verified"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="verification-title" className="text-lg font-bold text-lagoon">
            {t("title")}
          </h2>
          <Badge tone="success" data-testid="fiscal-status">
            {t("status.verified")}
          </Badge>
        </div>
        <Alert tone="success">{recent && context === "invoice" ? t("justVerified") : t("verifiedBody", { date: date ?? "" })}</Alert>
      </section>
    );
  }

  const blocked = state.left === 0;
  const counter =
    state.left === null
      ? null
      : blocked
        ? state.status === "pending"
          ? t("blockedPending")
          : t("blocked")
        : t("left", { count: state.left });
  const canUpload = hasNumbers && (state.status === "unverified" || state.status === "rejected");

  if (context === "invoice" && (compact || !blocked)) {
    return (
      <div
        role="note"
        className="flex flex-col gap-1 rounded-xl bg-turquoise-soft px-4 py-3 text-sm text-ink"
        data-testid="fiscal-verification"
        data-status={state.status}
      >
        {counter && (
          <p className={cn(blocked && "font-semibold")} data-testid="fiscal-counter">
            {counter}
          </p>
        )}
        {state.status === "pending" && !blocked && <p>{t("pendingShort")}</p>}
        {state.status === "rejected" && <p data-testid="fiscal-rejection">{t("rejectedBody", { reason: state.reason ?? "" })}</p>}
        {canUpload && (
          <Link
            href="/reglages#verification-fiscale"
            className="inline-flex min-h-11 items-center self-start font-semibold text-lagoon underline underline-offset-4"
            data-testid="fiscal-upload-link"
          >
            {t("goUpload")}
          </Link>
        )}
      </div>
    );
  }

  return (
    <section
      id="verification-fiscale"
      aria-labelledby="verification-title"
      className={cn(
        "flex scroll-mt-20 flex-col gap-4 rounded-card bg-surface p-4 shadow-card",
        blocked ? "border-2 border-turquoise" : "border border-sand/70",
      )}
      data-testid="fiscal-verification"
      data-status={state.status}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="verification-title" className="text-lg font-bold text-lagoon">
            {t("title")}
          </h2>
          <Badge tone={state.status === "rejected" ? "danger" : state.status === "pending" ? "accent" : "neutral"} data-testid="fiscal-status">
            {t(`status.${state.status}`)}
          </Badge>
        </div>
        {counter && (
          <p className={cn("text-sm", blocked ? "font-semibold text-ink" : "text-ink-muted")} data-testid="fiscal-counter">
            {counter}
          </p>
        )}
      </div>

      {state.status === "pending" && <Alert tone="info">{t("pendingBody")}</Alert>}
      {state.status === "rejected" && (
        <Alert tone="error">
          <span className="block" data-testid="fiscal-rejection">
            {t("rejectedBody", { reason: state.reason ?? "" })}
          </span>
          <span className="block">{t("rejectedNext")}</span>
        </Alert>
      )}

      {!hasNumbers && <p className="text-sm text-ink-muted">{t("numbersFirst")}</p>}
      {canUpload && (
        <>
          {state.status === "unverified" && <p className="text-sm text-ink-muted">{t("intro")}</p>}
          <FiscalDocumentsForm workspaceId={workspaceId} primary={blocked && context === "invoice"} />
        </>
      )}
    </section>
  );
}
