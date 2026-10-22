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
// reçoit le focus à chaque changement (annoncé par les lecteurs d'écran). Les étapes
// demandent JavaScript : boutons inactifs tant qu'il n'est pas chargé.
export function OnboardingWizard({
  locale,
  next,
  initialStep,
  workspaceId: initialWorkspaceId,
  activity,
  profile,
  logoUrl,
  brand,
  fiscal,
  fiscalStatus,
  sampleYear,
}: {
  locale: string;
  next: string | null;
  initialStep: OnboardingStep;
  workspaceId: string | null;
  activity: DiagnosticDefaults & { trade: string };
  profile: ProfileStepDefaults;
  logoUrl: string | null;
  brand: { primary: string; accent: string; font: BrandFont };
  fiscal: { nif: string; stat: string; tax_regime: string };
  fiscalStatus: string;
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
    requestAnimationFrame(() => titleRef.current?.focus());
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
          <span
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
          workspaceId={workspaceId}
          defaults={fiscal}
          fiscalStatus={fiscalStatus}
          onBack={() => goTo(2)}
        />
      )}

      {/* Fin du démarrage (« Plus tard », « Terminer » sans carte, « Accéder à mon espace »). */}
      <form id={FINISH_FORM_ID} action={finishOnboarding} hidden>
        <input type="hidden" name="locale" value={locale} />
        {next && <input type="hidden" name="next" value={next} />}
      </form>
    </div>
  );
}
