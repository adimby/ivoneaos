import "server-only";
import { headers } from "next/headers";
import { appUrlOrigin } from "./production-env";

// Domaine public de l'app (APP_URL), pour les liens envoyés aux clients et par e-mail.
// null si absent ou invalide : l'appelant prend l'origine de la requête. Obligatoire en
// production (next.config.ts).
export function publicAppUrl(): string | null {
  const origin = appUrlOrigin(process.env.APP_URL);
  if (!origin && process.env.APP_URL?.trim()) {
    console.error("[app-url] APP_URL invalide, origine de la requête utilisée.");
  }
  return origin;
}

// Origine des liens partagés depuis une page ou une action serveur. Sans APP_URL
// (développement, tests) : l'hôte de la requête. x-forwarded-host n'est lue que sur Vercel,
// qui la pose lui-même ; ailleurs, un client pourrait l'imposer.
export async function appOrigin(): Promise<string> {
  const configured = publicAppUrl();
  if (configured) return configured;
  const h = await headers();
  const forwarded = process.env.VERCEL ? h.get("x-forwarded-host") : null;
  const host = forwarded ?? h.get("host") ?? "localhost:3000";
  const proto =
    (process.env.VERCEL && h.get("x-forwarded-proto")) ||
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
