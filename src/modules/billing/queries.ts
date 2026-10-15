import "server-only";
import { createClient } from "@/lib/supabase/server";

// Exposé aux autres modules (liste de démarrage) : au moins un devis, brouillon compris ?
export async function hasQuote(workspaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
