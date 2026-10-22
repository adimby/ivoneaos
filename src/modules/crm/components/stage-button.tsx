"use client";

import { useId, useRef, useTransition, type ReactNode, type RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { useHydrated } from "@/lib/use-hydrated";
import { moveDeal, moveDealForm } from "../actions";
import { needsConfirmation, type StageKind } from "../stages";

// Passe l'opportunité à une étape en un geste (« Étape suivante » ou choix d'une étape) :
// l'alternative au glisser-déposer du pipeline, au clavier, au lecteur d'écran et au
// téléphone. Étape ouverte : simple formulaire d'action serveur, utilisable avant le
// chargement du JavaScript. Gagné et perdu se confirment dans une boîte de
// dialogue (JavaScript nécessaire).
export function StageButton({
  dealId,
  stage,
  back,
  variant = "secondary",
  className,
  children,
  label,
}: {
  dealId: string;
  stage: { id: string; kind: StageKind; label: string };
  back: string;
  variant?: "primary" | "secondary";
  className?: string;
  children: ReactNode;
  // Nom accessible complet (« Passer à l'étape Gagné »), si le texte visible est court.
  label?: string;
}) {
  const locale = useLocale();
  const fields = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="id" value={dealId} />
      <input type="hidden" name="stage_id" value={stage.id} />
    </>
  );

  if (!needsConfirmation(stage)) {
    return (
      <form action={moveDealForm} className="flex flex-1">
        {fields}
        <SubmitButton variant={variant} className={className} aria-label={label}>
          {children}
        </SubmitButton>
      </form>
    );
  }
  return (
    <ConfirmedMove dealId={dealId} stage={stage} back={back} variant={variant} className={className} label={label} locale={locale}>
      {children}
    </ConfirmedMove>
  );
}

function ConfirmedMove({
  dealId,
  stage,
  back,
  variant,
  className,
  label,
  locale,
  children,
}: {
  dealId: string;
  stage: { id: string; kind: StageKind };
  back: string;
  variant: "primary" | "secondary";
  className?: string;
  label?: string;
  locale: string;
  children: ReactNode;
}) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);

  function move() {
    dialog.current?.close();
    const data = new FormData();
    data.set("locale", locale);
    data.set("back", back);
    data.set("id", dealId);
    data.set("stage_id", stage.id);
    startTransition(async () => {
      await moveDeal(data);
    });
  }

  return (
    <>
      <Button
        variant={variant}
        className={className}
        aria-label={label}
        disabled={!hydrated || pending}
        aria-busy={pending || undefined}
        onClick={() => dialog.current?.showModal()}
      >
        {children}
      </Button>
      <StageConfirmDialog dialogRef={dialog} kind={stage.kind as "won" | "lost"} onConfirm={move} />
    </>
  );
}

// Confirmation de « gagné » ou « perdu » : bouton d'étape et glisser-déposer du pipeline.
export function StageConfirmDialog({
  dialogRef,
  kind,
  onConfirm,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  kind: "won" | "lost";
  onConfirm: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("Deals.confirm");
  // Unique : la même étape peut avoir deux boutons sur la page (grille et « Étape suivante »).
  const titleId = useId();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(22rem,calc(100%-2rem))] rounded-card border border-sand bg-surface p-5 text-ink shadow-card backdrop:bg-black/40"
    >
      <h2 id={titleId} className="text-lg font-bold text-lagoon">
        {t(`${kind}.title`)}
      </h2>
      <p className="mt-2 text-base text-ink-muted">{t(`${kind}.body`)}</p>
      <div className="mt-5 flex gap-3">
        {/* Focus sur « Annuler » : Entrée ou un double appui ne confirment pas par mégarde. */}
        <Button variant="secondary" className="flex-1" onClick={() => dialogRef.current?.close()} autoFocus>
          {t("cancel")}
        </Button>
        <Button className="flex-1" onClick={onConfirm}>
          {t("ok")}
        </Button>
      </div>
    </dialog>
  );
}
