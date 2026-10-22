"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __ivnSyncAppearance?: () => void;
  }
}

// Arrivée sans rechargement (connexion, déconnexion) : le script de tête ne s'exécute
// qu'au chargement complet. Relit le cookie d'apparence de cet appareil (posé à la
// connexion, effacé à la déconnexion) et l'applique, ou revient au défaut.
export function AppearanceFromCookie() {
  useEffect(() => {
    window.__ivnSyncAppearance?.();
  }, []);
  return null;
}
