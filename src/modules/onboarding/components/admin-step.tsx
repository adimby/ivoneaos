"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FieldErrors } from "@/lib/forms";
import { useHydrated } from "@/lib/use-hydrated";
import { FiscalDropZones, useFiscalDocuments, type VerificationResult } from "@/modules/verification/components/fiscal-documents-form";
import { saveFiscal, type ProfileFormState } from "@/modules/workspace/actions";
import { FiscalFields } from "@/modules/workspace/components/profile-fields";
import { checkRequired, focusFirstInvalid, RequiredLegend, StepFooter } from "./wizard-parts";

export const FINISH_FORM_ID = "onboarding-finish";

// Étape 3 « Administratif » : NIF, STAT, régime fiscal et photos de la carte fiscale (même
// service que Réglages : dépôt direct, lecture automatique, états). Facultative : « Plus
// tard » mène au tableau de bord (P1.4). « Terminer » enregistre les numéros (même action
// que le bloc « Avant ta première facture »), puis envoie les photos si elles sont
// déposées ; sans photo, le démarrage se termine (carte à déposer plus tard, dans Réglages).
export function AdminStep({
  hidden,
  locale,
  workspaceId,
  defaults,
  fiscalStatus,
  onBack,
}: {
  hidden: boolean;
  locale: string;
  workspaceId: string;
  defaults: { nif: string; stat: string; tax_regime: string };
  fiscalStatus: string;
  onBack: () => void;
}) {
  const t = useTranslations("Onboarding");
  const tAll = useTranslations();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const docs = useFiscalDocuments(workspaceId);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<ProfileFormState>({});
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  // Carte déjà déposée (rechargement après l'envoi) ou résultat de la vérification.
  const [result, setResult] = useState<VerificationResult | null>(
    fiscalStatus === "verified" || fiscalStatus === "pending" ? fiscalStatus : null,
  );

  const errors: FieldErrors = { ...localErrors, ...saved.fieldErrors };
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);
  const finish = () => document.querySelector<HTMLFormElement>(`#${FINISH_FORM_ID}`)?.requestSubmit();

  if (result) {
    return (
      <div hidden={hidden} className="flex flex-1 flex-col" data-testid="onboarding-step-3" data-result={result}>
        <Alert tone={result === "verified" ? "success" : "info"}>
          <span className="block" data-testid="onboarding-fiscal-result">
            {t(`step3.${result}`)}
          </span>
        </Alert>
        <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-sand/70 bg-spray/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:flex md:justify-end md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
          <Button type="submit" form={FINISH_FORM_ID} block className="md:w-auto" disabled={!hydrated}>
            {t("step3.goToApp")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      method="post"
      hidden={hidden}
      className="flex flex-1 flex-col"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-step-3"
      onSubmit={(event) => {
        event.preventDefault();
        const found = checkRequired(event.currentTarget);
        setLocalErrors(found);
        if (Object.keys(found).length > 0) return focusFirstInvalid(formRef.current);
        // Une seule photo : les deux sont nécessaires (message sous les zones de dépôt).
        const withCard = Boolean(docs.front || docs.back);
        if (withCard && !docs.ready()) return;
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          const response = await saveFiscal({}, data);
          setSaved(response);
          if (response.status !== "saved") return focusFirstInvalid(formRef.current);
          if (!withCard) return finish();
          const verified = await docs.verify();
          if (verified) setResult(verified);
        });
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value="/demarrage" />
      <p role="note" className="mb-5 rounded-xl bg-turquoise-soft px-4 py-3 text-sm font-medium text-ink" data-testid="onboarding-fiscal-limit">
        {t("step3.limit")}
      </p>
      <div className="grid gap-5 md:grid-cols-2 md:gap-x-6">
        <FiscalFields defaults={defaults} error={error} required={t("required")} />
      </div>

      <section aria-labelledby="card-title" className="mt-8 flex flex-col gap-4 border-t border-sand/70 pt-6">
        <div className="flex flex-col gap-1">
          <h2 id="card-title" className="text-lg font-bold text-lagoon">
            {t("step3.cardTitle")}
          </h2>
          <p className="text-sm text-ink-muted">{t("step3.cardHint")}</p>
        </div>
        {/* Ordinateur : le panneau du formulaire est étroit à côté de la promesse, une zone par ligne. */}
        <FiscalDropZones docs={docs} columns="md:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2" />
      </section>
      <RequiredLegend className="mt-5 md:hidden" />
      <StepFooter
        formError={saved.formError}
        pending={pending || docs.checking}
        hydrated={hydrated}
        onBack={onBack}
        submitLabel={t("step3.finish")}
        extra={
          // Formulaire de fin (hors de celui-ci) : marche aussi sans JavaScript.
          <Button type="submit" form={FINISH_FORM_ID} variant="secondary" disabled={pending || docs.checking} data-testid="onboarding-later">
            {t("step3.later")}
          </Button>
        }
      />
    </form>
  );
}
