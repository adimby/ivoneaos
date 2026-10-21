import { createHmac } from "node:crypto";

// Clé d'un compteur de public.auth_attempts : HMAC-SHA256 (clé secrète Supabase) de
// « action:portée:valeur ». La base ne garde ni l'adresse e-mail ni l'IP en clair, et une
// empreinte ne se retrouve pas en essayant toutes les IP sans la clé. Sans module
// server-only : les tests de bout en bout calculent les mêmes clés.
export type AttemptScope = "ip" | "email_ip" | "email";

export function attemptKey(secret: string, action: string, scope: AttemptScope, value: string): string {
  return createHmac("sha256", secret).update(`${action}:${scope}:${value}`).digest("hex");
}
