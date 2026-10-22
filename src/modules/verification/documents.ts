import { sniffImageType } from "@/modules/workspace/logo";

// Photos de la carte fiscale (recto et verso) : JPG, PNG ou WEBP, 10 Mo au plus chacune,
// envoyées directement par le navigateur dans le bucket privé « fiscal-documents »
// (dossier du workspace), jamais par le corps d'une action serveur. Le serveur relit
// ensuite chaque fichier et reconnaît son type à ses premiers octets.

export const FISCAL_BUCKET = "fiscal-documents";
export const FISCAL_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FISCAL_FILE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type FiscalFileType = keyof typeof FISCAL_FILE_TYPES;
export const FISCAL_FILE_ACCEPT = Object.keys(FISCAL_FILE_TYPES).join(",");
// Plus grand côté gardé pour la lecture (serveur) ; le navigateur réduit les photos plus
// grandes à cette taille avant l'envoi (JPEG, qualité FISCAL_JPEG_QUALITY).
export const FISCAL_IMAGE_MAX_SIDE = 2000;
export const FISCAL_JPEG_QUALITY = 0.85;

// Factures émises permises tant que la carte n'est pas vérifiée (même valeur que la base,
// next_document_number).
export const UNVERIFIED_INVOICE_LIMIT = 3;

export type FiscalFileError = "too_large" | "type";

export function isFiscalFileType(type: string): type is FiscalFileType {
  return Object.hasOwn(FISCAL_FILE_TYPES, type);
}

// Contrôle avant envoi (navigateur) : taille et type annoncé.
export function checkFiscalFile(file: { size: number; type: string }): FiscalFileError | null {
  if (file.size > FISCAL_FILE_MAX_BYTES) return "too_large";
  if (!isFiscalFileType(file.type)) return "type";
  return null;
}

// Contrôle serveur : taille réelle et type reconnu au contenu.
export function checkFiscalBytes(bytes: Uint8Array): FiscalFileError | null {
  if (bytes.byteLength === 0 || bytes.byteLength > FISCAL_FILE_MAX_BYTES) return "too_large";
  return sniffImageType(bytes) ? null : "type";
}

// <workspace>/<uuid>.<ext> : nom nouveau à chaque dépôt.
export function fiscalFilePath(workspaceId: string, type: FiscalFileType, id: string): string {
  return `${workspaceId}/${id}.${FISCAL_FILE_TYPES[type]}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH = new RegExp(`^(${UUID})/${UUID}\\.(jpg|png|webp)$`);

// Chemin envoyé par le navigateur : dans le dossier du workspace, au format attendu.
export function isFiscalFilePath(path: unknown, workspaceId: string): path is string {
  if (typeof path !== "string") return false;
  const match = PATH.exec(path);
  return Boolean(match && match[1] === workspaceId);
}

// Factures restantes avant que la vérification devienne obligatoire (0 : envoi bloqué).
export function invoicesLeft(status: string, issuedInvoices: number): number | null {
  if (status === "verified") return null;
  return Math.max(0, UNVERIFIED_INVOICE_LIMIT - issuedInvoices);
}
