import "server-only";
import { createClient } from "@/lib/supabase/server";

// Exposé aux autres modules (liste de démarrage) : compte Papi vérifié ?
// Colonnes listées : les secrets chiffrés ne sont pas lisibles par le navigateur.
export async function isPapiConnected(workspaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("provider", "papi")
    .maybeSingle();
  if (error) throw error;
  return data?.status === "connected";
}
