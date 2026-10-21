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
// (développement, tests) : l'hôte de la requête, lu dans x-forwarded-host. Next la remplit
// lui-même avec l'en-tête Host du client quand elle manque (l'en-tête host vu ici est alors
// celui du serveur interne, localhost:<port>) ; sur Vercel, la plateforme la pose. Hors
// Vercel, Host comme x-forwarded-host viennent du client : c'est pourquoi APP_URL est
// obligatoire pour une construction de production (next.config.ts, production-env.ts), et
// qu'un serveur de production lancé hors de Vercel sans elle l'écrit au démarrage
// (src/instrumentation.ts).
export async function appOrigin(): Promise<string> {
  const configured = publicAppUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
