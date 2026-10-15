"use client";

import { startTransition, useActionState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { BottomBar } from "@/components/ui/bottom-bar";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { PlanLimitLink } from "@/modules/workspace/components/plan-limit-link";
import { saveContact, type CrmFormState } from "../actions";
import { formatPhone } from "../phone";
import { CONTACT_KINDS } from "../constants";

export type ContactDefaults = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  company_name: string;
  kind: string;
  country: string;
  tags: string[];
};

export const EMPTY_CONTACT: ContactDefaults = {
  name: "",
  phone: "",
  email: "",
  company_name: "",
  kind: "person",
  country: "MG",
  tags: [],
};

// Création en 3 champs (nom, téléphone ou e-mail, entreprise) ; le reste est replié.
// countries : noms des pays dans la langue de l'interface (calculés par le serveur).
export function ContactForm({
  defaults,
  back,
  countries,
}: {
  defaults: ContactDefaults;
  back: string;
  countries: { code: string; name: string }[];
}) {
  const t = useTranslations("Contacts");
  const tAll = useTranslations();
  const locale = useLocale();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(saveContact, {});
  useFocusFirstInvalid(formRef, state);
  const errors = state.fieldErrors ?? {};
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);
  // Détails ouverts s'ils sont déjà remplis ou en erreur.
  const detailsOpen =
    defaults.kind !== "person" || defaults.country !== "MG" || defaults.tags.length > 0 || Boolean(errors.tags);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-1 flex-col gap-5"
      onSubmit={(event) => {
        // Envoi sans réinitialiser le formulaire : les saisies restent en cas d'erreur.
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Field id="name" label={t("name.label")} hint={t("name.hint")} error={error("name")}>
        {(c) => <Input {...c} name="name" autoComplete="name" defaultValue={defaults.name} maxLength={200} required />}
      </Field>
      <Field id="phone" label={t("phone.label")} hint={t("phone.hint")} error={error("phone")}>
        {(c) => (
          <Input
            {...c}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={defaults.phone ? formatPhone(defaults.phone) : ""}
            maxLength={40}
          />
        )}
      </Field>
      <Field id="email" label={t("email.label")} error={error("email")}>
        {(c) => <Input {...c} name="email" type="email" inputMode="email" autoComplete="email" defaultValue={defaults.email} maxLength={320} />}
      </Field>
      <Field id="company_name" label={t("company.label")} error={error("company_name")}>
        {(c) => <Input {...c} name="company_name" autoComplete="organization" defaultValue={defaults.company_name} maxLength={200} />}
      </Field>

      <details open={detailsOpen} className="group rounded-card border border-sand bg-sand-light">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 text-base font-semibold text-lagoon">
          {t("moreDetails")}
        </summary>
        <div className="flex flex-col gap-5 px-4 pb-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold text-ink">{t("kind.label")}</legend>
            <div className="flex gap-2">
              {CONTACT_KINDS.map((kind) => (
                <label
                  key={kind}
                  className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-sand-strong bg-white px-3 text-base font-semibold has-checked:border-lagoon has-checked:bg-lagoon has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-lagoon"
                >
                  <input type="radio" name="kind" value={kind} defaultChecked={defaults.kind === kind} className="sr-only" />
                  {t(`kind.${kind}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="country" label={t("country.label")} error={error("country")}>
            {(c) => (
              <Select {...c} name="country" defaultValue={defaults.country}>
                {countries.map(({ code, name }) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="tags" label={t("tags.label")} hint={t("tags.hint")} error={error("tags")}>
            {(c) => <Input {...c} name="tags" defaultValue={defaults.tags.join(", ")} maxLength={400} />}
          </Field>
        </div>
      </details>

      <BottomBar>
        <div aria-live="polite">
          {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
          {!pending && <PlanLimitLink error={state.formError} />}
        </div>
        <SubmitButton pending={pending} disabled={!hydrated} block>
          {defaults.id ? t("save") : t("create")}
        </SubmitButton>
      </BottomBar>
    </form>
  );
}
