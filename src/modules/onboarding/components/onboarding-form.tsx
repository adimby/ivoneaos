"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FieldErrors } from "@/lib/forms";
import { useHydrated } from "@/lib/use-hydrated";
import type { ProfileFormState } from "@/modules/workspace/actions";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { ProfileFields, type ProfileDefaults } from "@/modules/workspace/components/profile-fields";
import { completeOnboarding } from "../actions";
import { DIAGNOSTIC_FIELDS, EXPERIENCES } from "../diagnostic-fields";
import { levelFromClients } from "../level";

// Deux étapes dans un seul formulaire : l'étape masquée reste dans la page, ses réponses
// sont conservées (retour possible) et envoyées avec le profil à la fin.
// Formulaire POST (action serveur) : jamais d'envoi GET qui mettrait les saisies dans
// l'URL. Les étapes demandent JavaScript : boutons inactifs tant qu'il n'est pas chargé.
export function OnboardingForm({
  locale,
  defaults,
  next,
}: {
  locale: string;
  defaults: ProfileDefaults;
  next: string | null;
}) {
  const t = useTranslations("Onboarding");
  const tAll = useTranslations();
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(completeOnboarding, {});
  const [step, setStep] = useState<1 | 2>(1);
  const [shownState, setShownState] = useState(state);
  const [trade, setTrade] = useState(defaults.trade);
  const [clients, setClients] = useState("");
  const [stepErrors, setStepErrors] = useState<FieldErrors>({});
  const step1Ref = useRef<HTMLFieldSetElement>(null);
  const title1Ref = useRef<HTMLHeadingElement>(null);
  const title2Ref = useRef<HTMLHeadingElement>(null);

  // Erreurs du serveur prioritaires sur celles vérifiées localement à l'étape 1.
  const errors: FieldErrors = { ...stepErrors, ...state.fieldErrors };
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);

  function goTo(next: 1 | 2) {
    setStep(next);
    // Le titre de l'étape reçoit le focus : les lecteurs d'écran annoncent le changement.
    requestAnimationFrame(() => (next === 1 ? title1Ref : title2Ref).current?.focus());
  }

  function continueToProfile() {
    const found = checkStep(step1Ref.current);
    setStepErrors(found);
    if (Object.keys(found).length === 0) return goTo(2);
    // Premier champ en erreur : focus (et défilement) pour corriger tout de suite.
    step1Ref.current?.querySelector<HTMLElement>("input:invalid, select:invalid")?.focus();
  }

  // Réponse du serveur avec une erreur à l'étape 1 : y revenir (titre focalisé ensuite).
  const backToStep1 = Object.keys(state.fieldErrors ?? {}).some((field) => STEP1_FIELDS.has(field));
  if (shownState !== state) {
    setShownState(state);
    if (backToStep1) setStep(1);
  }
  useEffect(() => {
    if (backToStep1) title1Ref.current?.focus();
  }, [state, backToStep1]);

  const level = levelFromClients(Number(clients.replace(/\s/g, "")) || 0);

  return (
    <form
      action={formAction}
      noValidate
      className="flex flex-1 flex-col"
      onSubmit={(event) => {
        // Envoi sans réinitialiser le formulaire : les saisies restent en cas d'erreur.
        event.preventDefault();
        if (step === 1) return continueToProfile();
        const data = new FormData(event.currentTarget);
        setStepErrors({});
        // En cas de succès, l'action redirige (tableau de bord ou page demandée).
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}

      <Progress step={step} label={t("progress", { current: step, total: 2 })} />

      <fieldset ref={step1Ref} hidden={step !== 1} className="flex flex-col gap-5">
        <StepTitle ref={title1Ref} title={t("step1.title")} intro={t("step1.intro")} />
        <Field id="diag-trade" label={t("trade.label")} hint={t("trade.hint")} error={error("trade")}>
          {(c) => (
            <Input {...c} required value={trade} onChange={(e) => setTrade(e.target.value)} maxLength={200} autoComplete="organization-title" />
          )}
        </Field>
        <Field id="experience" label={t("experience.label")} error={error("experience")}>
          {(c) => (
            <Select {...c} name="experience" required defaultValue="">
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
        <Field id="current_clients" label={t("clients.label")} hint={t("clients.hint")} error={error("current_clients")}>
          {(c) => (
            <Input
              {...c}
              name="current_clients"
              inputMode="numeric"
              pattern="[0-9 ]*"
              required
              value={clients}
              onChange={(e) => setClients(e.target.value)}
              maxLength={7}
            />
          )}
        </Field>
        <Field id="monthly_income_goal" label={t("incomeGoal.label")} hint={t("incomeGoal.hint")} error={error("monthly_income_goal")}>
          {(c) => (
            <div className="relative">
              <Input {...c} name="monthly_income_goal" inputMode="numeric" pattern="[0-9 ]*" required maxLength={17} className="pr-12" />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold text-ink-muted" aria-hidden="true">
                Ar
              </span>
            </div>
          )}
        </Field>
      </fieldset>

      <div hidden={step !== 2} className="flex flex-col gap-5">
        <StepTitle ref={title2Ref} title={t("step2.title")} intro={t("step2.intro")} />
        <div className="flex flex-col gap-1 rounded-card border border-sand bg-sand-light p-4">
          <span className="text-sm text-ink-muted">{t("levelIntro")}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{tAll(`Levels.${level}.name`)}</Badge>
            <span className="text-sm">{tAll(`Levels.${level}.description`)}</span>
          </span>
        </div>
        <ProfileFields defaults={defaults} errors={errors} trade={{ value: trade, onChange: setTrade }} />
      </div>

      <div className="sticky bottom-0 -mx-4 mt-6 flex flex-col gap-3 border-t border-sand/70 bg-spray/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div aria-live="polite">
          {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
        </div>
        {step === 1 ? (
          <Button type="submit" block disabled={!hydrated}>
            {t("next")}
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => goTo(1)} disabled={pending || !hydrated}>
              {tAll("Common.back")}
            </Button>
            <SubmitButton pending={pending} disabled={!hydrated} className="flex-1">
              {t("submit")}
            </SubmitButton>
          </div>
        )}
      </div>
    </form>
  );
}

// Champs de l'étape 1 renvoyés en erreur par le serveur : y revenir.
const STEP1_FIELDS = new Set<string>(DIAGNOSTIC_FIELDS);

// Contrôle local de l'étape 1 (le serveur revalide tout).
function checkStep(fieldset: HTMLFieldSetElement | null): FieldErrors {
  const found: FieldErrors = {};
  fieldset?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach((control) => {
    const key = control.name || "trade";
    if (control.value.trim() === "") found[key] = control instanceof HTMLSelectElement ? "invalid_choice" : "required";
    else if (!control.validity.valid) found[key] = "invalid_number";
  });
  return found;
}

function Progress({ step, label }: { step: 1 | 2; label: string }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <p className="text-sm font-semibold text-lagoon">{label}</p>
      <div className="flex gap-2" aria-hidden="true">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-lagoon" : "bg-sand"}`} />
        ))}
      </div>
    </div>
  );
}

function StepTitle({ ref, title, intro }: { ref: Ref<HTMLHeadingElement>; title: string; intro: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 ref={ref} tabIndex={-1} className="text-2xl font-bold text-lagoon outline-none">
        {title}
      </h1>
      <p className="text-base text-ink-muted">{intro}</p>
    </div>
  );
}
