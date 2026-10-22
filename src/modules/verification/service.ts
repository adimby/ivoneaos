import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorKey } from "@/lib/db-errors";
import { sendEmail } from "@/lib/email";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { checkFiscalBytes, FISCAL_BUCKET, isFiscalFilePath } from "./documents";
import { adminRequestEmail, decisionEmail } from "./emails";
import { matchFiscalNumbers } from "./match";
import { readCardTexts } from "./ocr";

// Vérification de la carte fiscale (docs/spec-mvp.md, « Vérification fiscale »).
// Les photos sont déjà dans le bucket privé (envoi direct du navigateur) ; le serveur les
// relit avec la clé secrète (seul à pouvoir lire, lister et supprimer), crée la demande
// au nom de la personne connectée (submit_fiscal_verification, RLS), lit le texte, puis :
// concordance → vérifiée tout de suite et photos supprimées ; sinon → en attente d'un
// admin, prévenu par e-mail. La demande existe avant la lecture : une fonction arrêtée en
// cours de route laisse une demande « en attente » visible dans la file des admins.

// Temps laissé à la lecture automatique : sous le maxDuration de la route (60 s).
export const OCR_TIMEOUT_MS = 40_000;

export type SubmitError =
  | "unavailable"
  | "files_invalid"
  | "workspace_tax_info_missing"
  | "fiscal_already_verified"
  | "fiscal_already_pending"
  | "fiscal_documents_missing"
  | "unknown";
export type SubmitResult = { status: "verified" | "pending" } | { error: SubmitError };

type Workspace = { id: string; name: string };
type DecisionRow = Database["public"]["Functions"]["decide_fiscal_verification"]["Returns"][number];

const SUBMIT_ERRORS = new Set<string>([
  "workspace_tax_info_missing",
  "fiscal_already_verified",
  "fiscal_already_pending",
  "fiscal_documents_missing",
]);

export async function submitFiscalDocuments(
  supabase: SupabaseClient<Database>,
  workspace: Workspace,
  files: { front: unknown; back: unknown },
  origin: string,
): Promise<SubmitResult> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[verification] SUPABASE_SECRET_KEY absente : vérification fiscale indisponible.");
    return { error: "unavailable" };
  }
  const { front, back } = files;
  if (!isFiscalFilePath(front, workspace.id) || !isFiscalFilePath(back, workspace.id) || front === back) {
    return { error: "files_invalid" };
  }

  // Contenu réel de chaque photo (taille, type reconnu à ses premiers octets).
  const images: Uint8Array[] = [];
  for (const path of [front, back]) {
    const { data, error } = await admin.storage.from(FISCAL_BUCKET).download(path);
    const bytes = data ? new Uint8Array(await data.arrayBuffer()) : null;
    if (error || !bytes || checkFiscalBytes(bytes)) {
      await admin.storage.from(FISCAL_BUCKET).remove([front, back]);
      return { error: "files_invalid" };
    }
    images.push(bytes);
  }

  const { data: requestId, error } = await supabase.rpc("submit_fiscal_verification", {
    p_workspace_id: workspace.id,
    p_front_path: front,
    p_back_path: back,
  });
  if (error || !requestId) {
    const key = dbErrorKey(error);
    return { error: SUBMIT_ERRORS.has(key) ? (key as SubmitError) : "unknown" };
  }
  // Envois précédents jamais soumis, ou d'une demande annulée : supprimés.
  await cleanupFiscalFolder(admin, workspace.id, [front, back]);

  const { data: request } = await admin
    .from("fiscal_verifications")
    .select("nif, stat")
    .eq("id", requestId)
    .single();
  const texts = request ? await readCardTexts(images, OCR_TIMEOUT_MS) : null;
  if (request && texts && matchFiscalNumbers(texts, request).verified) {
    const decided = await admin.rpc("decide_fiscal_verification", {
      p_request_id: requestId,
      p_verified: true,
      p_method: "automatic",
    });
    if (!decided.error) {
      await removeFiles(admin, decided.data?.[0]);
      return { status: "verified" };
    }
    // NIF ou STAT changé pendant la lecture : la demande a été annulée, rien à décider.
    console.error("[verification] décision automatique refusée", decided.error.message);
  }

  await notifyAdmins(admin, workspace.name, requestId, origin);
  return { status: "pending" };
}

// Supprime du dossier du workspace toute photo qui n'est pas dans `keep` (dépôts
// abandonnés, demande annulée). Sans effet sur le résultat en cas d'échec.
export async function cleanupFiscalFolder(admin: AdminClient, workspaceId: string, keep: string[] = []) {
  try {
    const { data } = await admin.storage.from(FISCAL_BUCKET).list(workspaceId, { limit: 100 });
    const stale = (data ?? []).map((f) => `${workspaceId}/${f.name}`).filter((path) => !keep.includes(path));
    if (stale.length) await admin.storage.from(FISCAL_BUCKET).remove(stale);
  } catch (error) {
    console.error("[verification] nettoyage du dossier impossible", error instanceof Error ? error.message : "");
  }
}

// Photos d'une demande décidée : supprimées (la décision les a déjà retirées de la demande).
async function removeFiles(admin: AdminClient, row: Pick<DecisionRow, "front_path" | "back_path"> | undefined) {
  const paths = [row?.front_path, row?.back_path].filter((p): p is string => Boolean(p));
  if (!paths.length) return;
  const { error } = await admin.storage.from(FISCAL_BUCKET).remove(paths);
  if (error) console.error("[verification] photos non supprimées", error.message);
}

async function notifyAdmins(admin: AdminClient, workspaceName: string, requestId: string, origin: string) {
  const { data: emails, error } = await admin.rpc("platform_admin_emails");
  if (error) {
    console.error("[verification] admins introuvables", error.message);
    return;
  }
  if (!emails?.length) {
    console.warn("[verification] aucune admin enregistrée (platform_admins) : demande en attente sans e-mail.");
    return;
  }
  const link = `${origin}/fr/admin/verifications/${requestId}`;
  await Promise.all(emails.map((to) => sendEmail(adminRequestEmail(to, workspaceName, link))));
}

// Après une décision d'admin : photos supprimées, freelance prévenue (Resend si configuré).
export async function completeDecision(row: DecisionRow | undefined, decision: { verified: boolean; reason?: string | null }, origin: string) {
  const admin = createAdminClient();
  if (!row) return;
  if (admin) {
    await removeFiles(admin, row);
    await cleanupFiscalFolder(admin, row.workspace_id);
  } else {
    console.error("[verification] SUPABASE_SECRET_KEY absente : photos non supprimées.");
  }
  if (row.owner_email) {
    const locale = row.owner_locale === "en" ? "en" : "fr";
    await sendEmail(decisionEmail(row.owner_email, locale, decision, `${origin}/${locale}/reglages#verification-fiscale`));
  }
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
