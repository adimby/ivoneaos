import "server-only";
import type { Currency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { listPipelineTotals, listStages } from "@/modules/crm/queries";
import { summarizeDashboard, type DashboardSummary } from "./summary";

// Chiffres de l'accueil : trois lectures en parallèle (RLS : le workspace de la personne
// connectée), totaux calculés par la base, conversion dans la devise par défaut ici.
export async function getDashboardSummary(workspaceId: string, defaultCurrency: Currency): Promise<DashboardSummary> {
  const supabase = await createClient();
  const [invoices, pipelineTotals, stages] = await Promise.all([
    supabase.rpc("dashboard_invoice_totals", { p_workspace_id: workspaceId }),
    listPipelineTotals(workspaceId),
    listStages(workspaceId),
  ]);
  if (invoices.error) throw invoices.error;
  return summarizeDashboard({
    invoiceTotals: invoices.data.map((r) => ({ ...r, currency: r.currency as Currency, exchange_rate: Number(r.exchange_rate) })),
    pipelineTotals: pipelineTotals.map((r) => ({ ...r, currency: r.currency as Currency })),
    stages,
    defaultCurrency,
  });
}
