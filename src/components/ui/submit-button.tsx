"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

// Bouton d'envoi : désactivé et signalé occupé pendant l'envoi du formulaire parent.
export function SubmitButton({
  children,
  pending: pendingProp,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { pending?: boolean }) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;
  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending || undefined} {...props}>
      {pending && <Spinner />}
      {children}
    </Button>
  );
}

function Spinner() {
  return (
    <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
