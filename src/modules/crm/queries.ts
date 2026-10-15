import "server-only";
import { createClient } from "@/lib/supabase/server";

// Exposé aux autres modules (liste de démarrage) : au moins un contact actif ?
export async function hasActiveContact(workspaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (error) throw error;
  return (count ?? 0) > 0;
}
