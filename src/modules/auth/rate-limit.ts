import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Limites de la connexion par code, comptées par l'application (public.auth_rate_limit) :
// Supabase voit toutes les demandes venir des IP du serveur, ses propres limites sont donc
// communes à toutes les utilisatrices. Par e-mail : protège le code à 6 chiffres (au plus
// 10 essais par quart d'heure) et la boîte de la personne visée (5 envois). Par IP :
// généreux, une IP mobile malgache est partagée par beaucoup d'abonnés.
const WINDOW_SECONDS = 15 * 60;
export const AUTH_LIMITS = {
  send: { email: 5, ip: 50 },
  verify: { email: 10, ip: 50 },
} as const;

export type AuthAction = keyof typeof AUTH_LIMITS;

// IP du client. Sur Vercel, x-real-ip est posée par la plateforme (le client ne peut pas
// l'imposer). Ailleurs, x-forwarded-for : Next la remplit avec l'adresse de la connexion
// si elle manque ; derrière un autre hébergeur, le proxy doit la réécrire.
export function clientIp(h: Pick<Headers, "get">, onVercel: boolean): string {
  const real = onVercel ? h.get("x-real-ip")?.trim() : undefined;
  return real || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// true : tentative permise. Sans clé secrète (développement) ou si la base ne répond pas,
// la connexion reste possible (les limites de Supabase s'appliquent encore).
export async function allowAuthAttempt(action: AuthAction, email: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) {
    console.warn("[auth] SUPABASE_SECRET_KEY absente : limites de connexion désactivées.");
    return true;
  }
  const ip = clientIp(await headers(), Boolean(process.env.VERCEL));
  const limits = AUTH_LIMITS[action];
  // IP d'abord : une adresse e-mail visée n'est pas comptée pour des essais déjà refusés.
  for (const [key, max] of [
    [`${action}:ip:${ip}`, limits.ip],
    [`${action}:email:${email}`, limits.email],
  ] as const) {
    const { data, error } = await admin.rpc("auth_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: WINDOW_SECONDS,
    });
    if (error) {
      console.error("[auth] limite de connexion illisible", error.message);
      return true;
    }
    if (data === false) return false;
  }
  return true;
}
