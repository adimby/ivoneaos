import { ivoneaContactEmail } from "./contact-email";

// Origine du domaine public (APP_URL), ou null si absente ou invalide.
export function appUrlOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

// URL de services simulés (tests de bout en bout) : en production, elles enverraient les
// e-mails (jetons publics, clé API) ou les paiements vers un autre hôte.
export const TEST_ONLY_VARIABLES = ["PAPI_API_BASE_URL", "WHOP_API_BASE_URL", "RESEND_API_BASE_URL"] as const;

// Secrets serveur sans lesquels une fonction centrale tombe en silence en production.
const REQUIRED_SECRETS = [
  ["SUPABASE_SECRET_KEY", "webhooks, cron, limites de connexion"],
  ["PAYMENT_SECRETS_KEY", "secrets Papi/Whop des freelances"],
  ["CRON_SECRET", "relances et tâches planifiées"],
  ["RESEND_API_KEY", "e-mails aux clients et aux admins"],
] as const;

// Réglages obligatoires d'une construction de production (Vercel), vérifiés par
// next.config.ts : la construction échoue plutôt que de déployer une app mal réglée.
export function productionEnvErrors(env: Record<string, string | undefined>): string[] {
  const errors: string[] = [];
  // Sans adresse de contact, Réglages > Offre n'aurait aucun bouton pour changer d'offre,
  // et une freelance arrivée à la limite de l'offre Découverte resterait bloquée.
  if (!ivoneaContactEmail(env.IVONEA_CONTACT_EMAIL)) {
    errors.push("IVONEA_CONTACT_EMAIL manquante ou invalide (Réglages > Offre).");
  }
  // Sans domaine public, les liens envoyés aux clients et à Papi/Whop (retour après
  // paiement, notification) prendraient l'hôte de la requête, que le client choisit.
  const origin = appUrlOrigin(env.APP_URL);
  if (!origin || !origin.startsWith("https://")) {
    errors.push("APP_URL manquante ou invalide (domaine public en https://).");
  }
  for (const [name, role] of REQUIRED_SECRETS) {
    if (!env[name]?.trim()) errors.push(`${name} manquante (${role}).`);
  }
  for (const name of TEST_ONLY_VARIABLES) {
    if (env[name]?.trim()) errors.push(`${name} est réservée aux tests : à retirer en production.`);
  }
  return errors;
}

// Serveur lancé en production hors de Vercel (auto-hébergement, `next start`) sans APP_URL :
// les liens partagés (retours et notifications Papi/Whop, e-mails) prennent l'hôte de la
// requête, que le client choisit. Sur Vercel, x-forwarded-host est posée par la plateforme.
// Message d'avertissement affiché au démarrage (src/instrumentation.ts), ou null.
export function missingAppUrlWarning(env: Record<string, string | undefined>): string | null {
  if (env.NODE_ENV !== "production" || env.VERCEL || appUrlOrigin(env.APP_URL)) return null;
  return "[app-url] APP_URL absente en production hors de Vercel : les liens partagés prennent l'hôte envoyé par le client. Renseigne APP_URL (domaine public en https://).";
}
