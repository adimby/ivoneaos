import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { attemptKey, type AttemptScope } from "./attempt-key";

// Limites de la connexion par code, comptées par l'application (public.auth_rate_limit) :
// Supabase voit toutes les demandes venir des IP du serveur, ses propres limites sont donc
// communes à toutes les utilisatrices (README, « Mise en production de la connexion »).
// - ip : une IP ne peut pas, seule, atteindre les plafonds globaux de Supabase.
// - email_ip puis email : protègent le code à 6 chiffres et la boîte de la personne visée.
//   Comptées dans cet ordre, une IP ne pèse au plus que email_ip sur le compteur par e-mail :
//   bloquer l'adresse de quelqu'un demande plusieurs IP (compromis documenté dans le README).
const WINDOW_SECONDS = 15 * 60;
export const AUTH_LIMITS = {
  send: { ip: 20, email_ip: 5, email: 15 },
  verify: { ip: 20, email_ip: 5, email: 10 },
} as const satisfies Record<string, Record<AttemptScope, number>>;

export type AuthAction = keyof typeof AUTH_LIMITS;

// IP du client. Sur Vercel, x-real-ip est posée par la plateforme (le client ne peut pas
// l'imposer). Ailleurs, x-forwarded-for : Next la remplit avec l'adresse de la connexion
// si elle manque ; derrière un autre hébergeur, le proxy doit la réécrire.
export function clientIp(h: Pick<Headers, "get">, onVercel: boolean): string {
  const real = onVercel ? h.get("x-real-ip")?.trim() : undefined;
  return real || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export type AuthAttempt = {
  allowed: boolean;
  // Rend les essais comptés pour l'adresse e-mail (envoi refusé par Supabase : aucun code
  // parti). Le compteur par IP n'est jamais rendu, sinon une IP qui sature Supabase ne
  // serait jamais arrêtée.
  release: () => Promise<void>;
};

const noop = async () => {};

// Sans clé secrète (développement) ou si la base ne répond pas, la connexion reste possible
// (les limites de Supabase s'appliquent encore).
export async function takeAuthAttempt(action: AuthAction, email: string): Promise<AuthAttempt> {
  const admin = createAdminClient();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!admin || !secret) {
    console.warn("[auth] SUPABASE_SECRET_KEY absente : limites de connexion désactivées.");
    return { allowed: true, release: noop };
  }
  const ip = clientIp(await headers(), Boolean(process.env.VERCEL));
  const limits = AUTH_LIMITS[action];
  const counters: [AttemptScope, string, number][] = [
    ["ip", ip, limits.ip],
    ["email_ip", `${email}|${ip}`, limits.email_ip],
    ["email", email, limits.email],
  ];
  const taken: string[] = [];
  const release = async () => {
    for (const key of taken) {
      const { error } = await admin.rpc("auth_rate_limit_release", { p_key: key });
      if (error) console.error("[auth] essai de connexion non rendu", error.message);
    }
  };
  // Dans l'ordre : un compteur déjà plein ne laisse pas compter les suivants.
  for (const [scope, value, max] of counters) {
    const key = attemptKey(secret, action, scope, value);
    const { data, error } = await admin.rpc("auth_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: WINDOW_SECONDS,
    });
    if (error) {
      console.error("[auth] limite de connexion illisible", error.message);
      return { allowed: true, release };
    }
    if (data === false) return { allowed: false, release: noop };
    if (scope !== "ip") taken.push(key);
  }
  return { allowed: true, release };
}
