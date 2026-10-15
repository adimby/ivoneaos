import "server-only";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUserId } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseManualInstructions } from "./manual-instructions";

const WORKSPACE_COLUMNS =
  "id, name, trade, level, default_currency, nif, stat, tax_regime, address, logo_path, invoice_footer, plan, profile_completed_at";

// Au MVP, un freelance = un workspace (le plus ancien dont il est membre ; RLS).
export const getCurrentWorkspace = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_COLUMNS)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export type Workspace = NonNullable<Awaited<ReturnType<typeof getCurrentWorkspace>>>;

// Accueil guidé terminé : profil pro complet (profile_completed_at posé par la base).
export function isOnboarded(workspace: Workspace | null): boolean {
  return Boolean(workspace?.profile_completed_at);
}

// Pages de l'application : connecté et accueil guidé terminé, sinon redirection.
export async function requireWorkspace(locale: Locale): Promise<Workspace> {
  await requireUserId(locale);
  const workspace = await getCurrentWorkspace();
  if (!workspace || !isOnboarded(workspace)) return redirect({ href: "/demarrage", locale });
  return workspace;
}

export async function getManualPayment(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("manual_instructions")
    .eq("workspace_id", workspaceId)
    .eq("provider", "manual")
    .maybeSingle();
  if (error) throw error;
  return parseManualInstructions(data?.manual_instructions);
}

// URL signée (1 h) du logo, bucket privé « logos ».
export async function getLogoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("logos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
