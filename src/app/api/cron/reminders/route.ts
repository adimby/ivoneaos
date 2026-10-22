import type { NextRequest } from "next/server";
import { appOrigin } from "@/lib/app-url";
import { sameSecret } from "@/lib/same-secret";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDueReminders, renderDigest } from "@/modules/crm/reminder-notifications";
import { reminderStore } from "@/modules/crm/reminder-store";
import { sweepFiscalVerifications } from "@/modules/verification/files";

// Rappels du jour par e-mail (vercel.json : chaque jour à 05:00 UTC = 08:00 à Antananarivo).
// Vercel appelle cette route avec « Authorization: Bearer <CRON_SECRET> ».
// Même passage quotidien : rattrapage de la vérification fiscale (avis aux admins pour une
// demande restée sans avis, photos annulées ou jamais soumises supprimées).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "cron_disabled" }, { status: 503 });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "missing_secret_key" }, { status: 503 });

  const now = new Date();
  // Domaine public de l'app (APP_URL), pas l'hôte qui a appelé le cron (*.vercel.app).
  const appUrl = await appOrigin();
  const result = await notifyDueReminders({
    store: reminderStore(admin),
    send: (digest) => sendEmail(renderDigest(digest, appUrl, now)),
    now,
  });
  const fiscal = await sweepFiscalVerifications(admin, appUrl).catch((error: unknown) => {
    console.error("[cron] rattrapage de la vérification fiscale impossible", error instanceof Error ? error.message : "");
    return null;
  });
  return Response.json({ ...result, fiscal });
}
