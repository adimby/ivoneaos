"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { BrandFont } from "@/modules/branding/brand";
import { finishOnboarding } from "../actions";
import type { DiagnosticDefaults } from "../diagnostic-fields";
import type { OnboardingStep } from "../steps";
import { ActivityStep } from "./activity-step";
import { AdminStep, FINISH_FORM_ID } from "./admin-step";
import { ProfileStep, type ProfileStepDefaults } from "./profile-step";
import { Stepper } from "./wizard-parts";

// Démarrage en 3 étapes. Chaque étape est son propre formulaire POST (action serveur),
// tous restent dans la page : revenir en arrière garde les réponses. Le titre de l'étape
// reçoit le focus à chaque changement (annoncé par les lecteurs d'écran). Avant le
// chargement du JavaScript, les étapes 1 et 2 s'envoient comme des formulaires classiques :
// la page revient à l'étape calculée par le serveur (src/modules/onboarding/steps.ts).
export function OnboardingWizard({
  locale,
  next,
  initialStep,
  initialError,
  workspaceId: initialWorkspaceId,
  activity,
  profile,
  logoUrl,
  brand,
  fiscal,
  fiscalStatus,
  fiscalRejectionReason,
  sampleYear,
}: {
  locale: string;
  next: string | null;
  initialStep: OnboardingStep;
  initialError?: string;
  workspaceId: string | null;
  activity: DiagnosticDefaults & { trade: string };
  profile: ProfileStepDefaults;
  logoUrl: string | null;
  brand: { primary: string; accent: string; font: BrandFont };
  fiscal: { nif: string; stat: string; tax_regime: string };
  fiscalStatus: string;
  fiscalRejectionReason: string | null;
  sampleYear: number;
}) {
  const t = useTranslations("Onboarding");
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  // Métier : saisi à l'étape 1, repris (et modifiable) à l'étape 2.
  const [trade, setTrade] = useState(activity.trade);
  const titleRef = useRef<HTMLHeadingElement>(null);

  function goTo(target: OnboardingStep) {
    setStep(target);
    // Haut de page d'abord : sur téléphone, l'indicateur d'étapes (au-dessus du titre)
    // reste visible ; le focus ne fait pas défiler.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      titleRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6 md:gap-8">
      <div className="flex flex-col gap-5 md:flex-col-reverse md:gap-8">
        <Stepper step={step} />
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 id="onboarding-title" ref={titleRef} tabIndex={-1} className="text-2xl font-bold text-lagoon outline-none md:text-3xl">
              {t(`step${step}.title`)}
            </h1>
            <p className="text-base text-ink-muted">{t(`step${step}.intro`)}</p>
          </div>
          {/* Redondante avec l'indicateur d'étapes (lu, lui) : masquée aux lecteurs d'écran. */}
          <span
            aria-hidden="true"
            className="hidden shrink-0 rounded-full border border-sand-strong bg-surface px-3 py-1 text-sm font-semibold text-ink-muted md:inline-flex"
            data-testid="onboarding-step-pill"
          >
            {t("stepOf", { current: step, total: 3 })}
          </span>
        </div>
      </div>

      <ActivityStep
        hidden={step !== 1}
        locale={locale}
        next={next}
        initialError={initialStep === 1 ? initialError : undefined}
        defaults={activity}
        trade={trade}
        onTradeChange={setTrade}
        onSaved={(id) => {
          setWorkspaceId(id);
          goTo(2);
        }}
      />
      <ProfileStep
        hidden={step !== 2}
        locale={locale}
        next={next}
        initialError={initialStep === 2 ? initialError : undefined}
        defaults={profile}
        trade={trade}
        onTradeChange={setTrade}
        logoUrl={logoUrl}
        brand={brand}
        sampleYear={sampleYear}
        onBack={() => goTo(1)}
        onSaved={(id) => {
          setWorkspaceId(id);
          goTo(3);
        }}
      />
      {workspaceId && (
        <AdminStep
          hidden={step !== 3}
          locale={locale}
          next={next}
          workspaceId={workspaceId}
          defaults={fiscal}
          fiscalStatus={fiscalStatus}
          fiscalRejectionReason={fiscalRejectionReason}
          onBack={() => goTo(2)}
        />
      )}

      {/* Fin du démarrage (« Terminer » sans carte, « Accéder à mon espace »). « Plus tard »
          envoie le formulaire de l'étape 3 à la même action (numéros déjà saisis gardés). */}
      <form id={FINISH_FORM_ID} action={finishOnboarding} hidden>
        <input type="hidden" name="locale" value={locale} />
        {next && <input type="hidden" name="next" value={next} />}
      </form>
    </div>
  );
}
