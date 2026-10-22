"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FieldErrors } from "@/lib/forms";
import { FiscalDropZones, useFiscalDocuments, type VerificationResult } from "@/modules/verification/components/fiscal-documents-form";
import { saveFiscal, type ProfileFormState } from "@/modules/workspace/actions";
import { FiscalFields } from "@/modules/workspace/components/profile-fields";
import { finishOnboarding } from "../actions";
import { checkRequired, focusFirstInvalid, RequiredLegend, StepFooter } from "./wizard-parts";

export const FINISH_FORM_ID = "onboarding-finish";

// Étape 3 « Administratif » : NIF, STAT, régime fiscal et photos de la carte fiscale (même
// service que Réglages : dépôt direct, lecture automatique, états). Facultative : « Plus
// tard » mène au tableau de bord (P1.4) en gardant les numéros déjà bien saisis (marche
// aussi sans JavaScript). « Terminer » enregistre les numéros (même action que le bloc
// « Avant ta première facture »), puis envoie les photos si elles sont déposées ; sans
// photo, le démarrage se termine (carte à déposer plus tard, dans Réglages).
export function AdminStep({
  hidden,
  locale,
  next,
  workspaceId,
  defaults,
  fiscalStatus,
  fiscalRejectionReason,
  onBack,
}: {
  hidden: boolean;
  locale: string;
  next: string | null;
  workspaceId: string;
  defaults: { nif: string; stat: string; tax_regime: string };
  fiscalStatus: string;
  fiscalRejectionReason: string | null;
  onBack: () => void;
}) {
  const t = useTranslations("Onboarding");
  const tVerification = useTranslations("Verification");
  const tAll = useTranslations();
  const formRef = useRef<HTMLFormElement>(null);
  const docs = useFiscalDocuments(workspaceId);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<ProfileFormState>({});
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  // Résultat de la vérification faite ici, sinon le statut de la carte : déjà déposée
  // (rechargement après l'envoi), ou changé ailleurs (« déjà vérifiée » ou « déjà en
  // cours » : la page est rafraîchie et le statut à jour arrive ici).
  const [verifiedHere, setVerifiedHere] = useState<VerificationResult | null>(null);
  const result = verifiedHere ?? (fiscalStatus === "verified" || fiscalStatus === "pending" ? fiscalStatus : null);

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
          <Button type="submit" form={FINISH_FORM_ID} block className="md:w-auto">
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
        // « Plus tard » : son action (finishOnboarding) reçoit le formulaire tel quel.
        if ((event.nativeEvent as SubmitEvent).submitter?.dataset.later !== undefined) return;
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
          if (verified) setVerifiedHere(verified);
        });
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value="/demarrage" />
      {next && <input type="hidden" name="next" value={next} />}
      {fiscalStatus === "rejected" && (
        <Alert tone="error" className="mb-5">
          <span className="block" data-testid="onboarding-fiscal-rejected">
            {tVerification("rejectedBody", { reason: fiscalRejectionReason ?? "" })}
          </span>
          <span className="block">{tVerification("rejectedNext")}</span>
        </Alert>
      )}
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
      <RequiredLegend className="mt-5 md:hidden" text={t("step3.requiredLegend")} />
      <StepFooter
        formError={saved.formError}
        pending={pending || docs.checking}
        submitNeedsJs
        onBack={onBack}
        submitLabel={t("step3.finish")}
        legend={t("step3.requiredLegend")}
        extra={
          // Envoie ce formulaire à finishOnboarding (aussi sans JavaScript) : numéros gardés.
          <Button
            type="submit"
            formAction={finishOnboarding}
            formNoValidate
            data-later=""
            variant="secondary"
            disabled={pending || docs.checking}
            data-testid="onboarding-later"
          >
            {t("step3.later")}
          </Button>
        }
      />
    </form>
  );
}
