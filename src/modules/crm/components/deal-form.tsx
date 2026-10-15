"use client";

import { startTransition, useActionState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { BottomBar } from "@/components/ui/bottom-bar";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CURRENCIES } from "@/lib/money";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { saveDeal, type CrmFormState } from "../actions";

export type DealDefaults = {
  id?: string;
  title: string;
  contact_id: string;
  stage_id?: string;
  currency: string;
  amount: string;
  expected_close_on: string;
};

// Titre, contact (choisi à la création, fixe ensuite : ses échanges et rappels lui
// restent liés), montant estimé et devise, étape (à la création, étapes ouvertes
// seulement), date de clôture prévue. Changer d'étape ensuite se fait depuis
// l'opportunité (« Étape suivante » ou choix d'une étape, gagné et perdu confirmés).
export function DealForm({
  defaults,
  back,
  contacts,
  contactsTotal,
  stages,
}: {
  defaults: DealDefaults;
  back: string;
  // Création : contacts proposés (liste limitée), et leur nombre total.
  // Modification : le contact de l'opportunité seulement.
  contacts: { id: string; label: string }[];
  contactsTotal?: number;
  // Création seulement : étapes ouvertes proposées. Absent en modification.
  stages?: { id: string; label: string }[];
}) {
  const t = useTranslations("Deals");
  const tAll = useTranslations();
  const locale = useLocale();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(saveDeal, {});
  useFocusFirstInvalid(formRef, state);
  const errors = state.fieldErrors ?? {};
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-1 flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Field id="title" label={t("title_field.label")} hint={t("title_field.hint")} error={error("title")}>
        {(c) => <Input {...c} name="title" defaultValue={defaults.title} maxLength={200} required />}
      </Field>
      {defaults.id ? (
        <Field id="contact_id" label={t("contact.label")} hint={t("contact.fixed")}>
          {(c) => (
            <>
              <input type="hidden" name="contact_id" value={defaults.contact_id} />
              <Input {...c} value={contacts.find((x) => x.id === defaults.contact_id)?.label ?? ""} readOnly />
            </>
          )}
        </Field>
      ) : (
      <Field
        id="contact_id"
        label={t("contact.label")}
        hint={
          contactsTotal !== undefined && contactsTotal > contacts.length
            ? t("contact.truncated", { shown: contacts.length, total: contactsTotal })
            : undefined
        }
        error={error("contact_id")}
      >
        {(c) => (
          <Select {...c} name="contact_id" defaultValue={defaults.contact_id} required>
            <option value="" disabled>
              {tAll("Profile.choose")}
            </option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      )}
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field id="amount" label={t("amount.label")} hint={t("amount.hint")} error={error("amount")}>
          {(c) => <Input {...c} name="amount" inputMode="decimal" autoComplete="off" defaultValue={defaults.amount} maxLength={24} />}
        </Field>
        <Field id="currency" label={t("currency.label")} error={error("currency")}>
          {(c) => (
            <Select {...c} name="currency" defaultValue={defaults.currency}>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency === "MGA" ? "Ar" : currency === "EUR" ? "€" : "$"}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {stages && (
        <Field id="stage_id" label={t("stage.label")} error={error("stage_id")}>
          {(c) => (
            <Select {...c} name="stage_id" defaultValue={defaults.stage_id}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field id="expected_close_on" label={t("closeOn.label")} error={error("expected_close_on")}>
        {(c) => <Input {...c} name="expected_close_on" type="date" defaultValue={defaults.expected_close_on} />}
      </Field>

      <BottomBar>
        <div aria-live="polite">
          {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
        </div>
        <SubmitButton pending={pending} disabled={!hydrated} block>
          {defaults.id ? t("save") : t("create")}
        </SubmitButton>
      </BottomBar>
    </form>
  );
}
