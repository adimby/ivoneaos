import "server-only";
import { dbErrorKey } from "@/lib/db-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkFiscalBytes, FISCAL_BUCKET, isFiscalFilePath } from "./documents";
import { notifyAdmins, removeFiles, sweepFolder } from "./files";
import { matchFiscalNumbers } from "./match";
import { readCardTexts } from "./ocr";

// Vérification de la carte fiscale (docs/spec-mvp.md, « Vérification fiscale »).
// Les photos sont déjà dans le bucket privé (envoi direct du navigateur) ; le serveur (clé
// secrète, seul à pouvoir lire, lister et supprimer) les relit, crée la demande
// (submit_fiscal_verification, réservée au serveur ; l'appelant a vérifié que la personne
// est membre du workspace), lit le texte, puis : concordance → vérifiée tout de suite et
// photos supprimées ; sinon → en attente d'un admin, prévenu par e-mail. La demande existe
// avant la lecture : une fonction arrêtée en cours de route laisse une demande « en
// attente », signalée aux admins par le rattrapage quotidien (files.ts).

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

const SUBMIT_ERRORS = new Set<string>([
  "workspace_tax_info_missing",
  "fiscal_already_verified",
  "fiscal_already_pending",
  "fiscal_documents_missing",
]);

// workspace : lu avec le client de la personne connectée (RLS : elle en est membre).
export async function submitFiscalDocuments(
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

  const { data: requestId, error } = await admin.rpc("submit_fiscal_verification", {
    p_workspace_id: workspace.id,
    p_front_path: front,
    p_back_path: back,
  });
  if (error || !requestId) {
    const key = dbErrorKey(error);
    return { error: SUBMIT_ERRORS.has(key) ? (key as SubmitError) : "unknown" };
  }
  // Envois anciens jamais soumis : supprimés (pas ceux d'il y a quelques minutes).
  await sweepFolder(admin, workspace.id, [front, back]);

  const { data: request } = await admin
    .from("fiscal_verifications")
    .select("nif, stat")
    .eq("id", requestId)
    .single();
  const texts = request ? await readCardTexts(images, OCR_TIMEOUT_MS, (read) => matchFiscalNumbers(read, request).verified) : null;
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

  await notifyAdmins(admin, { id: requestId, workspaceName: workspace.name }, origin);
  return { status: "pending" };
}
