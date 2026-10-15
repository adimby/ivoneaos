"use client";

import { startTransition, useActionState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { addActivity, type CrmFormState } from "../actions";
import { ACTIVITY_KINDS } from "../constants";

// Note ou échange (appel, WhatsApp, e-mail, rendez-vous), daté (maintenant par défaut,
// heure de Madagascar). about : le contact, ou l'opportunité (dont le contact est déduit).
export function ActivityForm({
  about,
  back,
  now,
}: {
  about: { contactId: string } | { dealId: string };
  back: string;
  // Valeur datetime-local de l'heure actuelle à Antananarivo (calculée par le serveur).
  now: string;
}) {
  const t = useTranslations("Activities");
  const tAll = useTranslations();
  const locale = useLocale();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(addActivity, {});
  useFocusFirstInvalid(formRef, state);
  const errors = state.fieldErrors ?? {};
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      aria-labelledby="activity-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      {"contactId" in about ? (
        <input type="hidden" name="contact_id" value={about.contactId} />
      ) : (
        <input type="hidden" name="deal_id" value={about.dealId} />
      )}
      {/* Vidé après chaque ajout réussi. */}
      <div key={state.savedAt} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t("kind.label")}</legend>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_KINDS.map((kind) => (
              <label
                key={kind}
                className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-sand-strong bg-white px-4 text-sm font-semibold has-checked:border-lagoon has-checked:bg-lagoon has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lagoon"
              >
                <input type="radio" name="kind" value={kind} defaultChecked={kind === "note"} className="sr-only" />
                {t(`kinds.${kind}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="activity-body" label={t("body.label")} hint={t("body.hint")} error={error("body")}>
          {(c) => <Textarea {...c} name="body" rows={3} maxLength={10_000} required />}
        </Field>
        <Field id="occurred_at" label={t("occurredAt.label")} error={error("occurred_at")}>
          {(c) => <Input {...c} name="occurred_at" type="datetime-local" defaultValue={now} required />}
        </Field>
      </div>
      <div aria-live="polite">
        {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
        {state.status === "saved" && !pending && <Alert tone="success">{t("added")}</Alert>}
      </div>
      <SubmitButton pending={pending} disabled={!hydrated} variant="secondary" block>
        {t("add")}
      </SubmitButton>
    </form>
  );
}
