"use server";

import { notFound } from "next/navigation";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { appOrigin } from "@/lib/app-url";
import { dbErrorKey } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { completeDecision } from "./files";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const decisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["verify", "reject"]),
  reason: z.string().trim().max(500).optional(),
});

// Page admin : valider ou refuser une demande. La base vérifie que la personne est admin
// (admin_decide_fiscal_verification, sinon 42501 → 404 comme la page) et que le motif est
// présent pour un refus. Ensuite : photos supprimées, freelance prévenue par e-mail.
export async function decideFiscalRequest(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const parsed = decisionSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) notFound();
  const { id, decision, reason } = parsed.data;
  const detail = `/admin/verifications/${id}`;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: `/connexion?next=${encodeURIComponent(detail)}`, locale });

  const verified = decision === "verify";
  if (!verified && !reason) {
    return redirect({ href: `${detail}?erreur=fiscal_reason_required`, locale });
  }
  const { data, error } = await supabase.rpc("admin_decide_fiscal_verification", {
    p_request_id: id,
    p_verified: verified,
    p_reason: verified ? undefined : reason,
  });
  if (error?.code === "42501") notFound();
  if (error) {
    const key = dbErrorKey(error);
    // Déjà traitée (deux onglets, double envoi) ou annulée (NIF changé) : la fiche n'existe
    // plus, l'alerte s'affiche sur la liste.
    const back = key === "fiscal_request_not_pending" ? "/admin/verifications" : detail;
    return redirect({ href: `${back}?erreur=${key}`, locale });
  }

  // E-mail à la freelance : « sent », ou non parti (pas de clé Resend, échec, pas d'adresse).
  const email = await completeDecision(data?.[0], { verified, reason }, await appOrigin());
  return redirect({
    href: `/admin/verifications?ok=${verified ? "verified" : "rejected"}&email=${email === "sent" ? "sent" : "not_sent"}`,
    locale,
  });
}
