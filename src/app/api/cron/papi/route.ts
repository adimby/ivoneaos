import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { papiStore, syncOpenPapiLinks } from "@/modules/payments/papi/service";
import { paymentSecretsAvailable } from "@/modules/payments/secrets";
import { sameSecret } from "@/lib/same-secret";

// Rattrapage des paiements Papi (vercel.json : chaque jour, offre Hobby) : relit les
// liens encore payables (GET /payment-links/{reference}) et applique linkStatus (PAID :
// facture payée ; EXPIRED, DISABLED : lien fermé), puis purge les notifications non
// authentiques de plus de 30 jours. Appelée avec « Authorization: Bearer <CRON_SECRET> ».
// Le passage s'arrête de lui-même avant cette durée (secondes).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "cron_disabled" }, { status: 503 });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "missing_secret_key" }, { status: 503 });
  if (!paymentSecretsAvailable()) return Response.json({ error: "missing_payment_secrets_key" }, { status: 503 });
  return Response.json(await syncOpenPapiLinks(papiStore(admin)));
}
