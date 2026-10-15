"use client";

import { startTransition, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { useHydrated } from "@/lib/use-hydrated";
import { updateProfile, type ProfileFormState } from "../actions";
import { ProfileFields, type ProfileDefaults } from "./profile-fields";

export function ProfileForm({
  locale,
  defaults,
  logoUrl,
}: {
  locale: string;
  defaults: ProfileDefaults;
  logoUrl: string | null;
}) {
  const t = useTranslations("Profile");
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(updateProfile, {});
  const hydrated = useHydrated();

  return (
    // action : formulaire POST, jamais un GET qui mettrait NIF, STAT, RIB dans l'URL.
    // Bouton inactif tant que le JavaScript n'est pas chargé : avec le rendu partiel, la
    // réponse d'un envoi sans JavaScript n'affiche ni le résultat ni les erreurs. Ensuite,
    // onSubmit envoie sans réinitialiser le formulaire : les saisies restent en cas d'erreur.
    <form
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
      <ProfileFields defaults={defaults} errors={state.fieldErrors} logoUrl={logoUrl} logoKey={state.savedAt} />
      <div aria-live="polite">
        {state.formError && <Alert tone="error">{formErrorMessage(tErrors, state.formError)}</Alert>}
        {state.status === "saved" && !pending && <Alert tone="success">{t("saved")}</Alert>}
      </div>
      <SubmitButton pending={pending} disabled={!hydrated} block>
        {t("save")}
      </SubmitButton>
    </form>
  );
}

export function formErrorMessage(t: ReturnType<typeof useTranslations>, key: string): string {
  return key === "fix_errors" ? t("FormErrors.fix_errors") : t(`errors.db.${key}`);
}
