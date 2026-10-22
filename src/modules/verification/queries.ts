import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { countIssuedInvoices } from "@/modules/billing/queries";
import { invoicesLeft } from "./documents";

export type FiscalStatus = "unverified" | "pending" | "verified" | "rejected";
export type FiscalState = {
  status: FiscalStatus;
  at: string | null;
  reason: string | null;
  // Factures encore permises avant la vérification (null : carte vérifiée, sans plafond).
  left: number | null;
};

type WorkspaceFiscal = {
  id: string;
  fiscal_status: FiscalStatus;
  fiscal_status_at: string | null;
  fiscal_rejection_reason: string | null;
};

// État de la vérification et compteur de factures (lecture seulement si non vérifiée).
export async function getFiscalState(workspace: WorkspaceFiscal): Promise<FiscalState> {
  const left = workspace.fiscal_status === "verified" ? null : invoicesLeft(workspace.fiscal_status, await countIssuedInvoices(workspace.id));
  return { status: workspace.fiscal_status, at: workspace.fiscal_status_at, reason: workspace.fiscal_rejection_reason, left };
}

// Envoi d'une facture brouillon : refus (clé errors.db.*) si le plafond de factures sans
// carte vérifiée est atteint ; null sinon. La base applique la même règle sous verrou.
export async function invoiceSendBlock(
  workspace: Pick<WorkspaceFiscal, "id" | "fiscal_status">,
): Promise<"fiscal_verification_required" | "fiscal_verification_pending" | null> {
  if (workspace.fiscal_status === "verified") return null;
  if (invoicesLeft(workspace.fiscal_status, await countIssuedInvoices(workspace.id)) !== 0) return null;
  return workspace.fiscal_status === "pending" ? "fiscal_verification_pending" : "fiscal_verification_required";
}

// Admin de la plateforme (table platform_admins, contrôlée par la base).
export const isPlatformAdmin = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && data === true;
});

// File des demandes en attente (la base refuse un non-admin : 42501).
export async function getAdminQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_fiscal_queue");
  if (error) throw error;
  return data;
}

export type AdminRequest = Awaited<ReturnType<typeof getAdminQueue>>[number];

export async function getAdminHistory(limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_fiscal_history", { p_limit: limit });
  if (error) throw error;
  return data;
}
