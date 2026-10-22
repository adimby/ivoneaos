"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { createReminder, type CrmFormState } from "../actions";
import { QUICK_CHOICES } from "../reminder-dates";

const QUICK = Object.keys(QUICK_CHOICES) as (keyof typeof QUICK_CHOICES)[];

// « Me rappeler » : un geste (demain, dans 3 jours, dans 1 semaine, à 9 h heure de
// Madagascar) ou une date et une heure précises. L'objet est facultatif.
export function ReminderForm({
  about,
  back,
  defaultTitle,
  minDate,
}: {
  about: { contactId: string } | { dealId: string };
  back: string;
  defaultTitle: string;
  // Valeur datetime-local de l'heure actuelle (Antananarivo), proposée pour la date précise.
  minDate: string;
}) {
  const t = useTranslations("Reminders");
  const tAll = useTranslations();
  const locale = useLocale();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(createReminder, {});
  useFocusFirstInvalid(formRef, state);
  // « Autre date » : reste comme la personne l'a laissé ; s'ouvre sur une erreur de date
  // (pour montrer le champ fautif) et se referme après un rappel programmé.
  const [customOpen, setCustomOpen] = useState(false);
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.fieldErrors?.due_at) setCustomOpen(true);
    else if (state.status === "saved") setCustomOpen(false);
  }
  const errors = state.fieldErrors ?? {};
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        // Le bouton utilisé (choix rapide ou date précise) part avec le formulaire.
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="default_title" value={defaultTitle} />
      {"contactId" in about ? (
        <input type="hidden" name="contact_id" value={about.contactId} />
      ) : (
        <input type="hidden" name="deal_id" value={about.dealId} />
      )}
      <div key={state.savedAt} className="flex flex-col gap-4">
        <Field id="reminder-title" label={t("subject.label")} hint={t("subject.hint", { title: defaultTitle })} error={error("title")}>
          {(c) => <Input {...c} name="title" maxLength={200} placeholder={defaultTitle} />}
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t("quickLabel")}</legend>
          <div className="grid grid-cols-3 gap-2">
            {QUICK.map((choice) => (
              <Button
                key={choice}
                type="submit"
                name="when"
                value={choice}
                variant="secondary"
                disabled={!hydrated || pending}
                className="px-2 text-sm"
              >
                {t(`quick.${choice}`)}
              </Button>
            ))}
          </div>
        </fieldset>
        <details
          open={customOpen}
          onToggle={(event) => setCustomOpen(event.currentTarget.open)}
          className="rounded-card border border-sand bg-surface"
        >
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-semibold text-lagoon">
            {t("custom")}
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <Field id="due_at" label={t("dueAt.label")} error={error("due_at")}>
              {(c) => <Input {...c} name="due_at" type="datetime-local" defaultValue={minDate} />}
            </Field>
            <SubmitButton name="when" value="custom" pending={pending} disabled={!hydrated} variant="secondary" block>
              {t("schedule")}
            </SubmitButton>
          </div>
        </details>
      </div>
      <div aria-live="polite">
        {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
        {state.status === "saved" && !pending && <Alert tone="success">{t("created")}</Alert>}
      </div>
    </form>
  );
}
