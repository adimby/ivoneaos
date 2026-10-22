"use client";

import { startTransition, useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { saveFiscal, type ProfileFormState } from "../actions";
import { FiscalFields } from "./profile-fields";
import { formErrorMessage } from "./profile-form";

// « Avant ta première facture » : NIF, STAT et régime fiscal saisis là où la facture se
// prépare (nouvelle facture, devis accepté, brouillon à envoyer). Formulaire distinct du
// document : l'enregistrement met la page à jour sans toucher au brouillon en cours.
// Toujours rendu par la page (missing décide de l'affichage) : après l'enregistrement, le
// bloc laisse place à une confirmation au lieu de disparaître sans un mot.
export function FiscalInfoBlock({
  locale,
  back,
  missing,
  defaults,
  primary = false,
  compact = false,
  fiscalStatus,
}: {
  locale: string;
  back: string;
  missing: boolean;
  defaults: { nif: string; stat: string; tax_regime: string };
  // Action principale de la page (brouillon à envoyer) ; secondaire à côté d'un autre formulaire.
  primary?: boolean;
  // Replié (titre seul) : page où l'action principale est un autre formulaire (nouvelle
  // facture, enregistrable en brouillon sans données fiscales). Natif : marche sans JavaScript.
  compact?: boolean;
  // État de la vérification de la carte fiscale (avertissement avant de changer NIF ou STAT).
  fiscalStatus?: string;
}) {
  const t = useTranslations("Fiscal");
  const tAll = useTranslations();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(saveFiscal, {});
  useFocusFirstInvalid(formRef, state);
  const error = (field: string) => (state.fieldErrors?.[field] ? tAll(`FormErrors.${state.fieldErrors[field]}`) : undefined);

  if (!missing) {
    return state.status === "saved" ? (
      <Alert tone="success">
        <span data-testid="fiscal-saved">{t("saved")}</span>
        {state.fiscalReset && (
          <span className="mt-1 block text-ink" data-testid="fiscal-reset-done">
            {tAll("Profile.fiscal.resetDone")}
          </span>
        )}
      </Alert>
    ) : null;
  }

  const title = (
    <h2 id="fiscal-title" className="text-lg font-bold text-lagoon">
      {t("title")}
    </h2>
  );
  const intro = <p className="text-sm text-ink-muted">{t("intro")}</p>;
  // POST : NIF et STAT jamais dans l'URL. Envoi sans réinitialiser (saisies gardées en cas d'erreur).
  const form = (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      <FiscalFields defaults={defaults} error={error} fiscalStatus={fiscalStatus} />
      <div aria-live="polite">
        {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
      </div>
      {/* Attend le JavaScript, comme les autres formulaires de l'application : un envoi natif
          d'action serveur (POST) renvoie ici une page sans HTML rendu (seulement les données
          RSC, affichées par le JavaScript), donc une page blanche et l'erreur perdue. Vérifié
          en E2E (e2e/p5-devis-facture.spec.ts). Les champs, eux, sont saisissables dès l'affichage. */}
      <SubmitButton variant={primary ? "primary" : "secondary"} pending={pending} disabled={!hydrated} block>
        {t("save")}
      </SubmitButton>
    </form>
  );

  return (
    <section
      aria-labelledby="fiscal-title"
      className="flex flex-col gap-4 rounded-card border-2 border-turquoise bg-surface p-4 shadow-card"
      data-testid="fiscal-block"
    >
      {compact ? (
        <details open={Boolean(state.fieldErrors || state.formError)} className="group flex flex-col">
          {/* Titre seul dans summary (une rubrique, rien d'autre) : c'est le nom du bouton. */}
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            {title}
            <svg
              className="size-5 shrink-0 text-lagoon transition-transform group-open:rotate-180"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
            </svg>
          </summary>
          <div className="flex flex-col gap-4 pt-2">
            {intro}
            {form}
          </div>
        </details>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {title}
            {intro}
          </div>
          {form}
        </>
      )}
    </section>
  );
}
