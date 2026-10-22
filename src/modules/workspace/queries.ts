import "server-only";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUserId } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseManualInstructions } from "./manual-instructions";
import { canUse, PLAN_LIMITS, type Feature, type PlanUsage } from "./plan";

const WORKSPACE_COLUMNS =
  "id, name, trade, level, default_currency, nif, stat, tax_regime, address, logo_path, invoice_footer, plan, profile_completed_at, onboarded_at, brand_show_logo, brand_logo_size, brand_logo_position, brand_banner_path, brand_primary_color, brand_accent_color, brand_font";

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

// Accueil guidé terminé : nom, métier et adresse enregistrés (onboarded_at posé par la
// base). Les données fiscales viennent plus tard, avant la première facture.
export function isOnboarded(workspace: Workspace | null): boolean {
  return Boolean(workspace?.onboarded_at);
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

// Usage de l'offre (Réglages > Offre, contrôle avant l'action) : contacts actifs et
// documents envoyés ce mois-ci, comptés par la base (plan_usage, RLS appliquée).
export async function getPlanUsage(workspaceId: string): Promise<PlanUsage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plan_usage", { p_workspace_id: workspaceId }).single();
  if (error) throw error;
  return { activeContacts: data.active_contacts, documentsThisMonth: data.documents_this_month };
}

// Contrôle avant l'action (message clair sans attendre le refus de la base, qui reste
// juge). Offre sans limite pour cette fonction : aucune lecture.
export async function canUseNow(workspace: Pick<Workspace, "id" | "plan">, feature: Feature): Promise<boolean> {
  const limits = PLAN_LIMITS[workspace.plan];
  if ((feature === "create_contact" ? limits.activeContacts : limits.documentsPerMonth) === null) return true;
  return canUse(workspace, feature, await getPlanUsage(workspace.id));
}
