"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { FieldErrors } from "@/lib/forms";
import { useHydrated } from "@/lib/use-hydrated";
import { saveActivity, type StepState } from "../actions";
import { EXPERIENCES, type DiagnosticDefaults } from "../diagnostic-fields";
import { levelFromClients } from "../level";
import { checkRequired, focusFirstInvalid, RequiredLegend, StepFooter, useRequiredLabel } from "./wizard-parts";

// Étape 1 « Ton activité » : métier et diagnostic, avec l'aperçu du niveau (Lancer ou
// Remplir son agenda). Enregistrée dès « Suivant » (reprise après un rechargement).
export function ActivityStep({
  hidden,
  locale,
  defaults,
  trade,
  onTradeChange,
  onSaved,
}: {
  hidden: boolean;
  locale: string;
  defaults: DiagnosticDefaults;
  trade: string;
  onTradeChange: (value: string) => void;
  onSaved: (workspaceId: string) => void;
}) {
  const t = useTranslations("Onboarding");
  const tAll = useTranslations();
  const hydrated = useHydrated();
  const required = useRequiredLabel();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<StepState, FormData>(saveActivity, {});
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const [clients, setClients] = useState(defaults.current_clients);

  // Réponse du serveur : étape suivante, ou focus sur le premier champ en erreur.
  const onResponse = useEffectEvent((response: StepState) => {
    if (response.status === "saved" && response.workspaceId) onSaved(response.workspaceId);
    else if (response.fieldErrors) focusFirstInvalid(formRef.current);
  });
  useEffect(() => onResponse(state), [state]);

  const errors: FieldErrors = { ...localErrors, ...state.fieldErrors };
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);
  const clientCount = clients.replace(/\s/g, "");
  const level = /^\d+$/.test(clientCount) ? levelFromClients(Number(clientCount)) : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      hidden={hidden}
      className="flex flex-1 flex-col"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-step-1"
      onSubmit={(event) => {
        // Envoi sans réinitialiser le formulaire : les saisies restent (retour, erreur).
        event.preventDefault();
        const found = checkRequired(event.currentTarget);
        setLocalErrors(found);
        if (Object.keys(found).length > 0) return focusFirstInvalid(formRef.current);
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="grid gap-5 md:grid-cols-2 md:gap-x-6">
        <div className="md:col-span-2">
          <Field id="diag-trade" label={required(t("trade.label"))} hint={t("trade.hint")} error={error("trade")}>
            {(c) => (
              <Input
                {...c}
                name="trade"
                data-required
                value={trade}
                onChange={(e) => onTradeChange(e.target.value)}
                maxLength={200}
                autoComplete="organization-title"
              />
            )}
          </Field>
        </div>
        <Field id="experience" label={required(t("experience.label"))} error={error("experience")}>
          {(c) => (
            <Select {...c} name="experience" data-required defaultValue={defaults.experience}>
              <option value="" disabled>
                {tAll("Profile.choose")}
              </option>
              {EXPERIENCES.map((value) => (
                <option key={value} value={value}>
                  {t(`experience.${value}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="current_clients" label={required(t("clients.label"))} hint={t("clients.hint")} error={error("current_clients")}>
          {(c) => (
            <Input
              {...c}
              name="current_clients"
              inputMode="numeric"
              pattern="[0-9 ]*"
              data-required
              value={clients}
              onChange={(e) => setClients(e.target.value)}
              maxLength={7}
            />
          )}
        </Field>
        <Field id="monthly_income_goal" label={required(t("incomeGoal.label"))} hint={t("incomeGoal.hint")} error={error("monthly_income_goal")}>
          {(c) => (
            <div className="relative">
              <Input
                {...c}
                name="monthly_income_goal"
                inputMode="numeric"
                pattern="[0-9 ]*"
                data-required
                maxLength={17}
                defaultValue={defaults.monthly_income_goal}
                className="pr-12"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold text-ink-muted" aria-hidden="true">
                Ar
              </span>
            </div>
          )}
        </Field>
        {/* Aperçu du niveau, mis à jour avec le nombre de clients. */}
        <div className="flex flex-col gap-1.5 self-start rounded-card border border-sand bg-sand-light p-4" data-testid="level-preview" aria-live="polite">
          <span className="text-sm font-semibold text-ink-muted">{t("levelIntro")}</span>
          {level ? (
            <>
              <Badge className="self-start text-sm">{tAll(`Levels.${level}.name`)}</Badge>
              <span className="text-sm text-ink">{tAll(`Levels.${level}.description`)}</span>
            </>
          ) : (
            <span className="text-sm text-ink">{t("levelPending")}</span>
          )}
        </div>
      </div>
      <RequiredLegend className="mt-5 md:hidden" />
      <StepFooter formError={state.formError} pending={pending} hydrated={hydrated} submitLabel={t("next")} />
    </form>
  );
}
