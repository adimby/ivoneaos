"use client";

import { startTransition, useActionState, useEffect, useEffectEvent, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { FileDrop } from "@/components/ui/file-drop";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { FieldErrors } from "@/lib/forms";
import { useHydrated } from "@/lib/use-hydrated";
import { CURRENCIES } from "@/lib/money";
import type { BrandFont } from "@/modules/branding/brand";
import { BrandEssentials } from "@/modules/branding/components/brand-essentials";
import { LOGO_ACCEPT, LOGO_MAX_BYTES } from "@/modules/workspace/logo";
import { saveProfileStep, type StepState } from "../actions";
import { checkRequired, INITIAL_STATE, focusFirstInvalid, RequiredLegend, StepFooter, useRequiredLabel } from "./wizard-parts";

export type ProfileStepDefaults = { name: string; address: string; default_currency: string };

// Étape 2 « Ton profil et ta marque » : profil pro (nom commercial, métier, adresse,
// devise, logo) et image de marque essentielle avec l'aperçu d'un devis. L'enregistrement
// ouvre l'application (onboarded_at, posé par la base).
export function ProfileStep({
  hidden,
  locale,
  next,
  initialError,
  defaults,
  trade,
  onTradeChange,
  logoUrl,
  brand,
  sampleYear,
  onBack,
  onSaved,
}: {
  hidden: boolean;
  locale: string;
  next: string | null;
  // Erreur d'un envoi classique (avant le JavaScript), montrée jusqu'au prochain envoi.
  initialError?: string;
  defaults: ProfileStepDefaults;
  trade: string;
  onTradeChange: (value: string) => void;
  logoUrl: string | null;
  brand: { primary: string; accent: string; font: BrandFont };
  sampleYear: number;
  onBack: () => void;
  onSaved: (workspaceId: string) => void;
}) {
  const t = useTranslations("Onboarding");
  const tProfile = useTranslations("Profile");
  const tAll = useTranslations();
  const required = useRequiredLabel();
  // Avant le JavaScript : contrôle du navigateur (required, pattern) ; ensuite, le nôtre.
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<StepState, FormData>(saveProfileStep, INITIAL_STATE);
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const [name, setName] = useState(defaults.name);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  // Erreur du serveur sur le logo, effacée dès qu'un autre fichier est choisi (réponse
  // « vue » : son erreur de logo n'est plus montrée).
  const [logoSeen, setLogoSeen] = useState<StepState | null>(null);
  const logoError = logoSeen === state ? undefined : state.fieldErrors?.logo;

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);

  const onResponse = useEffectEvent((response: StepState) => {
    if (response.status === "saved" && response.workspaceId) onSaved(response.workspaceId);
    else if (response.fieldErrors) focusFirstInvalid(formRef.current);
  });
  useEffect(() => onResponse(state), [state]);

  const errors: FieldErrors = { ...localErrors, ...state.fieldErrors };
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate={hydrated}
      hidden={hidden}
      className="flex flex-1 flex-col"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-step-2"
      onSubmit={(event) => {
        event.preventDefault();
        const found = checkRequired(event.currentTarget);
        setLocalErrors(found);
        if (Object.keys(found).length > 0) return focusFirstInvalid(formRef.current);
        const data = new FormData(event.currentTarget);
        data.set("js", "1");
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="grid gap-5 md:grid-cols-2 md:gap-x-6">
        <Field id="name" label={required(tProfile("businessName.label"))} hint={tProfile("businessName.hint")} error={error("name")}>
          {(c) => (
            <Input {...c} name="name" data-required required autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          )}
        </Field>
        <Field id="trade" label={required(tProfile("trade.label"))} error={error("trade")}>
          {(c) => <Input {...c} name="trade" data-required required value={trade} onChange={(e) => onTradeChange(e.target.value)} maxLength={200} />}
        </Field>
        <div className="md:col-span-2">
          <Field id="address" label={required(tProfile("address.label"))} hint={tProfile("address.hint")} error={error("address")}>
            {(c) => <Input {...c} name="address" data-required required autoComplete="street-address" defaultValue={defaults.address} maxLength={500} />}
          </Field>
        </div>
        <Field id="default_currency" label={tProfile("currency.label")} hint={tProfile("currency.hint")} error={error("default_currency")}>
          {(c) => (
            <Select {...c} name="default_currency" defaultValue={defaults.default_currency}>
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {tProfile(`currency.${currency}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="md:col-span-2">
          <FileDrop
            id="logo"
            name="logo"
            label={tProfile("logo.label")}
            accept={LOGO_ACCEPT}
            maxBytes={LOGO_MAX_BYTES}
            currentUrl={logoUrl}
            error={logoError ? tAll(`FormErrors.${logoError}`) : undefined}
            onFile={(file) => {
              setLogoSeen(state);
              setLogoPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </div>
      </div>

      <section aria-labelledby="brand-title" className="mt-8 flex flex-col gap-4 border-t border-sand/70 pt-6">
        <div className="flex flex-col gap-1">
          <h2 id="brand-title" className="text-lg font-bold text-lagoon">
            {t("step2.brandTitle")}
          </h2>
          <p className="text-sm text-ink-muted">{t("step2.brandIntro")}</p>
        </div>
        <BrandEssentials
          defaults={brand}
          errors={state.fieldErrors}
          businessName={name.trim() || t("step2.previewName")}
          logoUrl={logoPreview ?? logoUrl}
          sampleYear={sampleYear}
        />
      </section>
      <RequiredLegend className="mt-5 md:hidden" />
      <StepFooter formError={state === INITIAL_STATE ? initialError : state.formError} pending={pending} onBack={onBack} submitLabel={t("next")} />
    </form>
  );
}
