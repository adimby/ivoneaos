import { missingAppUrlWarning } from "./lib/production-env";

// Appelée une fois au démarrage du serveur.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const warning = missingAppUrlWarning(process.env);
  if (warning) console.warn(warning);
}
