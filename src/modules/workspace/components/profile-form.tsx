"use client";

import { startTransition, useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { updateProfile, type ProfileFormState } from "../actions";
import { ProfileFields, type ProfileDefaults } from "./profile-fields";

export function ProfileForm({
  locale,
  defaults,
  logoUrl,
  fiscalRequired,
  fiscalStatus,
}: {
  locale: string;
  defaults: ProfileDefaults;
  logoUrl: string | null;
  fiscalRequired: boolean;
  fiscalStatus: string;
}) {
  const t = useTranslations("Profile");
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  return (
    // action : formulaire POST, jamais un GET qui mettrait NIF, STAT, RIB dans l'URL.
    // Bouton inactif tant que le JavaScript n'est pas chargé : avec le rendu partiel, la
    // réponse d'un envoi sans JavaScript n'affiche ni le résultat ni les erreurs. Ensuite,
    // onSubmit envoie sans réinitialiser le formulaire : les saisies restent en cas d'erreur.
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
      {/* logoKey : après un enregistrement, le champ logo est vidé (le même fichier n'est pas renvoyé). */}
      <ProfileFields defaults={defaults} errors={state.fieldErrors} logoUrl={logoUrl} logoKey={state.savedAt} fiscal fiscalRequired={fiscalRequired} fiscalStatus={fiscalStatus} />
      <div aria-live="polite">
        {state.formError && <Alert tone="error">{formErrorMessage(tErrors, state.formError)}</Alert>}
        {state.status === "saved" && !pending && <Alert tone="success">{t("saved")}</Alert>}
        {state.status === "saved" && state.fiscalReset && !pending && (
          <Alert tone="info" className="mt-2">
            <span data-testid="fiscal-reset-done">{t("fiscal.resetDone")}</span>
          </Alert>
        )}
      </div>
      {/* Ordinateur : bouton à sa taille, aligné à droite sous les champs. */}
      <SubmitButton pending={pending} disabled={!hydrated} block className="lg:w-auto lg:self-end">
        {t("save")}
      </SubmitButton>
    </form>
  );
}

export function formErrorMessage(t: ReturnType<typeof useTranslations>, key: string): string {
  // check_answers : erreur d'un envoi classique du démarrage (champs non signalés).
  return key === "fix_errors" || key === "check_answers" ? t(`FormErrors.${key}`) : t(`errors.db.${key}`);
}
