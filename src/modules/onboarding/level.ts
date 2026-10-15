import type { Database } from "@/lib/supabase/database.types";

export type WorkspaceLevel = Database["public"]["Enums"]["workspace_level"];

// Diagnostic (spec P1.3) : aucun client → « Lancer » ; déjà des clients → « Remplir son agenda ».
export function levelFromClients(currentClients: number): Extract<WorkspaceLevel, "lancer" | "remplir"> {
  return currentClients > 0 ? "remplir" : "lancer";
}
