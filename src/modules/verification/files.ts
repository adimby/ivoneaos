import "server-only";
import { sendEmail, type SendResult } from "@/lib/email";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { FISCAL_BUCKET } from "./documents";
import { adminRequestEmail, decisionEmail } from "./emails";

// Fichiers et avis de la vérification fiscale, sans la lecture automatique (pas de
// tesseract ni de sharp dans les fonctions qui l'importent : actions, cron, pages admin).

// Photo déposée mais jamais soumise : supprimée après ce délai (le temps de soumettre).
const ORPHAN_AFTER_MS = 60 * 60 * 1000;
// Demande en attente sans avis aux admins après ce délai : la route a été arrêtée.
const UNNOTIFIED_AFTER_MS = 5 * 60 * 1000;

type DecisionRow = Database["public"]["Functions"]["decide_fiscal_verification"]["Returns"][number];

// Supprime du dossier du workspace les photos déposées depuis plus d'une heure qui ne
// sont ni dans `keep` ni dans une demande en attente (dépôts jamais soumis). Les dépôts
// récents restent : la freelance peut être en train de soumettre. Sans effet sur le
// résultat en cas d'échec.
export async function sweepFolder(admin: AdminClient, workspaceId: string, keep: string[] = []) {
  try {
    const [{ data: files, error }, { data: pending }] = await Promise.all([
      admin.storage.from(FISCAL_BUCKET).list(workspaceId, { limit: 1000 }),
      admin.from("fiscal_verifications").select("front_path, back_path").eq("workspace_id", workspaceId).eq("status", "pending"),
    ]);
    if (error) throw error;
    const kept = new Set([...keep, ...(pending ?? []).flatMap((r) => [r.front_path, r.back_path])]);
    const cutoff = Date.now() - ORPHAN_AFTER_MS;
    const stale = (files ?? [])
      .filter((f) => f.id && f.created_at && Date.parse(f.created_at) < cutoff)
      .map((f) => `${workspaceId}/${f.name}`)
      .filter((path) => !kept.has(path));
    if (stale.length) await admin.storage.from(FISCAL_BUCKET).remove(stale);
  } catch (error) {
    console.error("[verification] nettoyage du dossier impossible", error instanceof Error ? error.message : "");
  }
}

// Photos des demandes annulées (NIF ou STAT changé pendant l'attente) : supprimées, puis
// leurs chemins effacés. Seulement ces fichiers-là : jamais un dépôt en cours.
async function discardCancelled(admin: AdminClient, workspaceId?: string) {
  let query = admin
    .from("fiscal_verifications")
    .select("id, front_path, back_path")
    .eq("status", "cancelled")
    .or("front_path.not.is.null,back_path.not.is.null");
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const { data, error } = await query;
  if (error) return console.error("[verification] demandes annulées illisibles", error.message);
  for (const row of data ?? []) {
    if (await removeFiles(admin, row)) {
      await admin.from("fiscal_verifications").update({ front_path: null, back_path: null }).eq("id", row.id);
    }
  }
}

// NIF ou STAT changé pendant une vérification : la base a annulé la demande, ses photos
// sont supprimées (appelé après la réponse).
export async function discardFiscalFiles(workspaceId: string) {
  const admin = createAdminClient();
  if (admin) await discardCancelled(admin, workspaceId);
}

// Photos connues d'une demande : supprimées. false si la suppression a échoué.
export async function removeFiles(admin: AdminClient, row: { front_path: string | null; back_path: string | null } | undefined): Promise<boolean> {
  const paths = [row?.front_path, row?.back_path].filter((p): p is string => Boolean(p));
  if (!paths.length) return true;
  const { error } = await admin.storage.from(FISCAL_BUCKET).remove(paths);
  if (error) console.error("[verification] photos non supprimées", error.message);
  return !error;
}

// Avis aux admins pour une demande encore en attente (annulée entre-temps : rien, son lien
// mènerait à une page introuvable). L'avis est noté pour ne pas être renvoyé.
export async function notifyAdmins(admin: AdminClient, request: { id: string; workspaceName: string }, origin: string) {
  const { data: current } = await admin.from("fiscal_verifications").select("status").eq("id", request.id).maybeSingle();
  if (current?.status !== "pending") return;
  const { data: emails, error } = await admin.rpc("platform_admin_emails");
  if (error) {
    console.error("[verification] admins introuvables", error.message);
    return;
  }
  if (!emails?.length) {
    console.warn("[verification] aucune admin enregistrée (platform_admins) : demande en attente sans e-mail.");
  } else {
    const link = `${origin}/fr/admin/verifications/${request.id}`;
    await Promise.all(emails.map((to) => sendEmail(adminRequestEmail(to, request.workspaceName, link))));
  }
  await admin.from("fiscal_verifications").update({ admins_notified_at: new Date().toISOString() }).eq("id", request.id);
}

// Rattrapage quotidien (cron) : avis aux admins pour les demandes restées en attente sans
// avis (route arrêtée par la plateforme pendant la lecture), photos des demandes annulées
// et dépôts jamais soumis supprimés.
export async function sweepFiscalVerifications(admin: AdminClient, origin: string) {
  const before = new Date(Date.now() - UNNOTIFIED_AFTER_MS).toISOString();
  const { data: unnotified, error } = await admin
    .from("fiscal_verifications")
    .select("id, workspaces(name)")
    .eq("status", "pending")
    .is("admins_notified_at", null)
    .lt("created_at", before);
  if (error) console.error("[verification] demandes en attente illisibles", error.message);
  for (const row of unnotified ?? []) {
    await notifyAdmins(admin, { id: row.id, workspaceName: row.workspaces?.name ?? "" }, origin);
  }

  await discardCancelled(admin);

  const { data: folders } = await admin.storage.from(FISCAL_BUCKET).list("", { limit: 1000 });
  const workspaceIds = (folders ?? []).filter((f) => !f.id).map((f) => f.name);
  for (const id of workspaceIds) await sweepFolder(admin, id);
  return { notified: unnotified?.length ?? 0, folders: workspaceIds.length };
}

// Après une décision d'admin : photos supprimées, freelance prévenue (Resend si configuré).
// Renvoie le sort de l'e-mail (skipped : pas de clé Resend ou pas d'adresse).
export async function completeDecision(
  row: DecisionRow | undefined,
  decision: { verified: boolean; reason?: string | null },
  origin: string,
): Promise<SendResult> {
  if (!row) return "skipped";
  const admin = createAdminClient();
  if (admin) {
    await removeFiles(admin, row);
    await sweepFolder(admin, row.workspace_id);
  } else {
    console.error("[verification] SUPABASE_SECRET_KEY absente : photos non supprimées.");
  }
  if (!row.owner_email) return "skipped";
  const locale = row.owner_locale === "en" ? "en" : "fr";
  return sendEmail(decisionEmail(row.owner_email, locale, decision, `${origin}/${locale}/reglages#verification-fiscale`));
}

// URL signées courtes (5 min) des photos d'une demande, pour la page admin (appelée après
// le contrôle admin fait par la base).
export async function signedPhotoUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const admin = createAdminClient();
  if (!admin) return paths.map(() => null);
  return Promise.all(
    paths.map(async (path) => {
      if (!path) return null;
      const { data } = await admin.storage.from(FISCAL_BUCKET).createSignedUrl(path, 300);
      return data?.signedUrl ?? null;
    }),
  );
}
