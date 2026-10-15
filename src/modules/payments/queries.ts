import "server-only";
import { createClient } from "@/lib/supabase/server";

// Exposé aux autres modules (liste de démarrage) : compte Papi vérifié ?
// (statut « error » : clé refusée par Papi depuis, à reconnecter)
// Colonnes listées : les secrets chiffrés ne sont pas lisibles par le navigateur.
export async function isPapiConnected(workspaceId: string): Promise<boolean> {
  return (await getPapiAccount(workspaceId))?.status === "connected";
}

export async function getPapiAccount(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("status, last_checked_at")
    .eq("workspace_id", workspaceId)
    .eq("provider", "papi")
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Paiements en ligne reçus pour une facture, du plus récent au plus ancien (moyen affiché à
// la freelance ; sur une facture annulée, paiement d'un lien Papi envoyé avant l'annulation).
export async function getOnlinePayments(workspaceId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("provider, method, amount, paid_at")
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId)
    .neq("provider", "manual")
    .order("paid_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Liens Papi d'une facture vus par la freelance : lien encore payable chez Papi (Papi ne
// permet pas de désactiver un lien, même annulé ici) et paiements signalés par Papi mais
// non enregistrés (montant différent, facture non payable).
export async function getInvoicePapiLinks(workspaceId: string, invoiceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_links")
    .select("merchant_reference, status, expires_at, last_error")
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId)
    .eq("provider", "papi");
  if (error) throw error;
  const now = Date.now();
  return {
    // Lien envoyé au client et encore payable : actif ou annulé ici, pas encore expiré.
    payable: data.some(
      (l) => (l.status === "active" || l.status === "cancelled") && (!l.expires_at || new Date(l.expires_at).getTime() > now),
    ),
    issues: data
      .filter((l) => l.last_error === "amount_mismatch" || l.last_error === "not_payable")
      .map((l) => ({ reference: l.merchant_reference, error: l.last_error as "amount_mismatch" | "not_payable" })),
  };
}
