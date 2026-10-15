import "server-only";
import { createClient } from "@/lib/supabase/server";

// Exposé aux autres modules (facturation) : l'opportunité passe à l'étape « gagné »
// (devis accepté, transformé en facture). Sans effet si elle y est déjà, si elle est
// archivée ou si elle n'appartient pas au workspace (RLS). La base le fait aussi à
// l'acceptation du devis (trigger) ; ici, l'étape est rétablie si elle a changé depuis.
export async function markDealWon(workspaceId: string, dealId: string): Promise<void> {
  const supabase = await createClient();
  const { data: won, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("kind", "won")
    .maybeSingle();
  if (stageError) throw stageError;
  if (!won) return;
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: won.id })
    .eq("id", dealId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .neq("stage_id", won.id);
  if (error) throw error;
}
