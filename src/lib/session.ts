import "server-only";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

// Identité vérifiée (signature du JWT), une fois par requête.
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
});

export async function requireUserId(locale: Locale): Promise<string> {
  const userId = await getUserId();
  if (!userId) return redirect({ href: "/connexion", locale });
  return userId;
}
