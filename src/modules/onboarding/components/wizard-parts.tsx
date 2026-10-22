"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CheckIcon, InvoiceIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { RequiredMark } from "@/components/ui/required-mark";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FieldErrors } from "@/lib/forms";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import type { StepState } from "../actions";
import { ONBOARDING_STEPS, type OnboardingStep } from "../steps";

// État de départ des étapes 1 et 2 (comparé par identité : rien encore envoyé).
export const INITIAL_STATE: StepState = {};

export const STEP_KEYS = { 1: "activity", 2: "profile", 3: "admin" } as const;
const STEP_ICONS = { 1: WalletIcon, 2: InvoiceIcon, 3: ShieldIcon } as const;

// Libellé d'un champ obligatoire : astérisque + « obligatoire » pour les lecteurs d'écran.
export function useRequiredLabel() {
  const t = useTranslations("Onboarding");
  return function requiredLabel(text: string) {
    return (
      <>
        {text}
        <RequiredMark label={t("required")} />
      </>
    );
  };
}

// Contrôle local avant l'envoi (le serveur revalide tout) : champs marqués data-required
// vides, nombres mal saisis (attribut pattern). Les champs d'une étape masquée sont ignorés.
export function checkRequired(form: HTMLFormElement | null): FieldErrors {
  const found: FieldErrors = {};
  form?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach((control) => {
    if (control.dataset.required !== undefined && control.value.trim() === "") {
      found[control.name] = control instanceof HTMLSelectElement ? "invalid_choice" : "required";
    } else if (control instanceof HTMLInputElement && control.pattern && !control.validity.valid) {
      found[control.name] = "invalid_number";
    }
  });
  return found;
}

// Premier champ en erreur : focus (et défilement) pour corriger tout de suite.
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    const field = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!field) return;
    field.focus({ preventScroll: true });
    (field.closest("[data-field]") ?? field).scrollIntoView({ block: "center" });
  });
}

// Indicateur d'étapes. Tablette et ordinateur : trois étapes côte à côte (icône dans un
// carré, « ÉTAPE 1 » + nom, ligne de liaison colorée une fois l'étape faite, coche).
// Téléphone : « Étape 2 / 3 », le nom et une barre. Une seule des deux listes est
// affichée (et donc lue) à chaque largeur ; l'étape en cours porte aria-current.
export function Stepper({ step }: { step: OnboardingStep }) {
  const t = useTranslations("Onboarding");
  const name = (n: OnboardingStep) => t(`steps.${STEP_KEYS[n]}`);
  return (
    <nav aria-label={t("stepsLabel")} data-testid="onboarding-stepper">
      <div className="flex flex-col gap-2 md:hidden">
        <p className="flex items-baseline justify-between gap-3 text-sm" aria-hidden="true">
          <span className="font-semibold text-lagoon">{t("stepOf", { current: step, total: 3 })}</span>
          <span className="truncate font-medium text-ink-muted">{name(step)}</span>
        </p>
        <ol className="flex gap-1.5">
          {ONBOARDING_STEPS.map((n) => (
            <li key={n} aria-current={n === step ? "step" : undefined} className="flex-1">
              <span aria-hidden="true" className={cn("block h-1.5 rounded-full", n <= step ? "bg-lagoon" : "bg-sand")} />
              <span className="sr-only">
                {t("stepItem", { n, name: name(n) })}
                {n < step && ` (${t("stepDone")})`}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {/* Grille : chaque étape à la largeur de son texte, les deux liaisons se partagent
          le reste à parts égales (sous-grille : la liaison appartient à son étape). */}
      <ol className="hidden items-center gap-3 md:grid md:grid-cols-[auto_minmax(1rem,1fr)_auto_minmax(1rem,1fr)_auto]">
        {ONBOARDING_STEPS.map((n) => {
          const Icon = STEP_ICONS[n];
          const done = n < step;
          const current = n === step;
          return (
            <li
              key={n}
              aria-current={current ? "step" : undefined}
              className={cn("grid grid-cols-subgrid items-center", n < 3 ? "col-span-2" : "col-span-1")}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl",
                    current && "bg-lagoon text-on-lagoon shadow-sm",
                    done && "bg-turquoise-soft text-lagoon",
                    !current && !done && "border border-sand-strong bg-surface text-ink-muted",
                  )}
                >
                  {done ? <CheckIcon className="size-5" /> : <Icon className="size-5" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-xs font-semibold tracking-wider uppercase", current ? "text-lagoon" : "text-ink-muted")}>
                    {t("stepLabel", { n })}
                  </span>
                  <span
                    data-step-name
                    className={cn("text-sm leading-tight font-semibold lg:text-base", current || done ? "text-ink" : "text-ink-muted")}
                  >
                    {name(n)}
                    {done && <span className="sr-only"> ({t("stepDone")})</span>}
                  </span>
                </span>
              </span>
              {n < 3 && <span aria-hidden="true" data-connector className={cn("h-0.5 rounded-full", done ? "bg-lagoon" : "bg-sand")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Légende des astérisques (téléphone : sous les champs ; tablette et ordinateur : dans le pied).
// text : légende propre à l'étape (étape 3, facultative : « Obligatoires pour terminer »).
export function RequiredLegend({ className, text }: { className?: string; text?: string }) {
  const t = useTranslations("Onboarding");
  return (
    <p className={cn("text-sm text-ink-muted", className)}>
      <span aria-hidden="true" className="text-danger">
        *
      </span>{" "}
      {text ?? t("requiredLegend")}
    </p>
  );
}

// Pied d'une étape : « Précédent » à gauche, légende et bouton principal à droite. Téléphone :
// barre collée en bas, à portée du pouce (« Précédent » réduit à sa flèche). « Précédent »
// attend le JavaScript ; le bouton principal aussi si submitNeedsJs (étape 3 : photos
// envoyées depuis le navigateur), sinon le formulaire part même avant son chargement.
export function StepFooter({
  formError,
  pending,
  submitNeedsJs = false,
  onBack,
  extra,
  submitLabel,
  legend,
}: {
  formError?: string;
  pending: boolean;
  submitNeedsJs?: boolean;
  onBack?: () => void;
  extra?: ReactNode;
  submitLabel: string;
  // Texte de la légende des astérisques (par défaut « Champs obligatoires »).
  legend?: string;
}) {
  const t = useTranslations("Onboarding");
  const tAll = useTranslations();
  const hydrated = useHydrated();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-col gap-3 border-t border-sand/70 bg-spray/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
      <div aria-live="polite" className="empty:hidden">
        {formError && !pending && <Alert tone="error">{formErrorMessage(tAll, formError)}</Alert>}
      </div>
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="secondary" onClick={onBack} disabled={pending || !hydrated} className="px-3 md:px-5" data-testid="onboarding-back">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            <span className="sr-only md:not-sr-only">{t("previous")}</span>
          </Button>
        )}
        <RequiredLegend className="ml-auto hidden md:block" text={legend} />
        <div className="flex flex-1 gap-3 md:flex-none">
          {extra}
          <SubmitButton pending={pending} disabled={submitNeedsJs && !hydrated} className="flex-1 md:flex-none">
            {submitLabel}
            {!pending && <ArrowRightIcon className="size-5" />}
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}
