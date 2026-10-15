import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDueReminders, renderDigest } from "@/modules/crm/reminder-notifications";
import { reminderStore } from "@/modules/crm/reminder-store";

// Rappels du jour par e-mail (vercel.json : chaque jour à 05:00 UTC = 08:00 à Antananarivo).
// Vercel appelle cette route avec « Authorization: Bearer <CRON_SECRET> ».
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
  const appUrl = publicAppUrl() ?? request.nextUrl.origin;
  const result = await notifyDueReminders({
    store: reminderStore(admin),
    send: (digest) => sendEmail(renderDigest(digest, appUrl, now)),
    now,
  });
  return Response.json(result);
}

function publicAppUrl(): string | null {
  const value = process.env.APP_URL?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    console.error("[cron] APP_URL invalide, origine de la requête utilisée.");
    return null;
  }
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
