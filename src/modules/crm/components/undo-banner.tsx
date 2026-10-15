"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { restoreContact, restoreDeal, type CrmFormState } from "../actions";

// Après un archivage : message et « Annuler » (désarchive et rouvre la fiche).
export function UndoBanner({
  kind,
  id,
  message,
  undoLabel,
  back,
}: {
  kind: "contact" | "deal";
  id: string;
  message: string;
  undoLabel: string;
  back: string;
}) {
  const tAll = useTranslations();
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    kind === "contact" ? restoreContact : restoreDeal,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="id" value={id} />
      <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-lagoon px-4 py-2 text-white on-dark">
        <span className="text-sm font-medium">{message}</span>
        <SubmitButton pending={pending} variant="secondary" className="shrink-0 px-3 text-sm">
          {undoLabel}
        </SubmitButton>
      </div>
      {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
    </form>
  );
}
