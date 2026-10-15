"use client";

import { ErrorState } from "@/components/app-shell/error-state";

// Erreur d'une page de l'application : affichée dans la coquille (en-tête, onglets).
export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState {...props} />;
}
