import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PayableInvoice } from "@/modules/payments/papi/service";
import { publicPath } from "./share";

// Facture émise → données du lien de paiement en ligne (module payments). Le nom du
// client et le nom commercial viennent de la copie figée à l'émission.

export const PAYABLE_COLUMNS = "id, workspace_id, number, currency, status, total, amount_paid, language, public_token, snapshot";

export type PayableRow = {
  id: string;
  workspace_id: string;
  number: string | null;
  currency: string;
  status: string;
  total: number;
  amount_paid: number;
  language: string;
  public_token: string;
  snapshot: Json | null;
};

function snapshotText(snapshot: Json | null, party: "client" | "freelancer", key: string): string {
  const value = (snapshot as Record<string, Record<string, unknown> | undefined> | null)?.[party]?.[key];
  return typeof value === "string" ? value : "";
}

export function payableInvoice(row: PayableRow, origin: string): PayableInvoice {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    number: row.number,
    currency: row.currency,
    status: row.status,
    total: row.total,
    amountPaid: row.amount_paid,
    language: row.language === "en" ? "en" : "fr",
    clientName: snapshotText(row.snapshot, "client", "name"),
    businessName: snapshotText(row.snapshot, "freelancer", "business_name"),
    publicUrl: `${origin}${publicPath(row.language === "en" ? "en" : "fr", row.public_token)}`,
  };
}

// Page publique « Payer » : facture émise retrouvée par son jeton (client sans compte).
// Client serveur : seul le jeton, secret de la facture, donne accès à cette ligne.
export async function getPayableInvoiceByToken(token: string): Promise<PayableRow | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("invoices")
    .select(PAYABLE_COLUMNS)
    .eq("public_token", token)
    .neq("status", "draft")
    .maybeSingle();
  if (error) throw error;
  return data;
}
