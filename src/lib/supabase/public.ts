import "server-only";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client anonyme (clé publique, sans session ni cookie) des pages publiques : il n'atteint
// que les fonctions get_public_quote, get_public_invoice et accept_quote, et les logos
// des documents émis. Jamais de clé secrète pour une page ouverte par n'importe qui.
export async function createPublicClient() {
  await connection();
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
