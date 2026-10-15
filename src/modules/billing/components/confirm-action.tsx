"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { useHydrated } from "@/lib/use-hydrated";

// Action qui se confirme dans une boîte de dialogue (annuler une facture, supprimer un
// brouillon, marquer payée). Le formulaire de la boîte appelle l'action serveur ; le
// focus va d'abord sur « Retour » : Entrée ou un double appui ne confirment pas par mégarde.
export function ConfirmAction({
  action,
  fields,
  label,
  title,
  body,
  confirmLabel,
  cancelLabel,
  variant = "secondary",
  block = false,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  block?: boolean;
  // Champs en plus dans la boîte (par exemple le moyen de paiement).
  children?: ReactNode;
}) {
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <Button variant={variant} block={block} disabled={!hydrated} onClick={() => dialog.current?.showModal()}>
        {label}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(22rem,calc(100%-2rem))] rounded-card border border-sand bg-white p-5 text-ink shadow-card backdrop:bg-ink/40"
      >
        <form action={action} className="flex flex-col gap-4">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <h2 id={titleId} className="text-lg font-bold text-lagoon">
            {title}
          </h2>
          <p className="text-base text-ink-muted">{body}</p>
          {children}
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1 px-3" onClick={() => dialog.current?.close()} autoFocus>
              {cancelLabel}
            </Button>
            <SubmitButton className="flex-1 px-3">{confirmLabel}</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
