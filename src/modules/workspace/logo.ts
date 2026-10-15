// Logo : 1 Mo au plus, PNG, JPEG ou WebP, reconnu à ses premiers octets (le type annoncé
// par le navigateur ne suffit pas). Chaque envoi a un nom nouveau : le bucket « logos »
// n'accepte que des ajouts, un document émis garde le logo de son émission.

export const LOGO_MAX_BYTES = 1024 * 1024;

export const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type LogoType = keyof typeof LOGO_TYPES;

export const LOGO_ACCEPT = Object.keys(LOGO_TYPES).join(",");

export function isLogoType(type: string): type is LogoType {
  return Object.hasOwn(LOGO_TYPES, type);
}

export function sniffImageType(bytes: Uint8Array): LogoType | null {
  const starts = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// Contrôle avant envoi (navigateur) : taille et type annoncé.
export function checkLogoFile(file: { size: number; type: string }): "logo_too_large" | "logo_type" | null {
  if (file.size > LOGO_MAX_BYTES) return "logo_too_large";
  if (!isLogoType(file.type)) return "logo_type";
  return null;
}

// Contrôle serveur : taille, puis type réel d'après le contenu.
export function checkLogoBytes(bytes: Uint8Array): { error: "logo_too_large" | "logo_type" } | { type: LogoType } {
  if (bytes.byteLength > LOGO_MAX_BYTES) return { error: "logo_too_large" };
  const type = sniffImageType(bytes);
  return type ? { type } : { error: "logo_type" };
}

export function logoPath(workspaceId: string, type: LogoType, version: string): string {
  return `${workspaceId}/logo-${version}.${LOGO_TYPES[type]}`;
}

export type CheckedLogo = { bytes: Uint8Array; type: LogoType };
export type LogoReadResult = { logo: CheckedLogo | null } | { error: "logo_too_large" | "logo_type" };

// Contrôle serveur du champ « logo » d'un formulaire, avant toute écriture en base :
// pas de fichier (ou vide) → null ; sinon taille, puis type réel d'après le contenu.
export async function readLogoUpload(value: FormDataEntryValue | null): Promise<LogoReadResult> {
  if (!(value instanceof File) || value.size === 0) return { logo: null };
  if (value.size > LOGO_MAX_BYTES) return { error: "logo_too_large" };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const checked = checkLogoBytes(bytes);
  return "error" in checked ? checked : { logo: { bytes, type: checked.type } };
}
