"use client";

import { ErrorState } from "@/components/app-shell/error-state";
import { PlainPage } from "@/components/app-shell/plain-page";

// Erreur hors des pages de l'application : connexion, accueil guidé (/demarrage),
// vérification de la session ou du workspace dans la coquille.
export default function LocaleError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <PlainPage>
      <ErrorState {...props} />
    </PlainPage>
  );
}
