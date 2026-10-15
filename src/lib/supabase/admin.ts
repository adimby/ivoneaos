import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client « secret » (rôle serveur, RLS contournée) : tâches planifiées et webhooks
// seulement, jamais pour une requête faite au nom d'une personne connectée.
// null si SUPABASE_SECRET_KEY est absente (la fonctionnalité appelante se désactive).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
