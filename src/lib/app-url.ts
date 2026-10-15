import "server-only";
import { headers } from "next/headers";

// Domaine public de l'app (APP_URL), pour les liens envoyés aux clients et par e-mail.
// null si absent ou invalide : l'appelant prend l'origine de la requête.
export function publicAppUrl(): string | null {
  const value = process.env.APP_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    console.error("[app-url] APP_URL invalide, origine de la requête utilisée.");
    return null;
  }
}

// Origine des liens partagés depuis une page ou une action serveur.
export async function appOrigin(): Promise<string> {
  const configured = publicAppUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
