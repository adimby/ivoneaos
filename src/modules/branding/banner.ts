import { LOGO_MAX_BYTES, sniffImageType } from "@/modules/workspace/logo";

// Bannière d'en-tête des devis et factures : mêmes contrôles que le logo (1 Mo, type
// reconnu à ses premiers octets, bucket privé « logos » en ajout seul, un dossier par
// workspace), mais PNG ou JPEG seulement : le moteur PDF ne lit pas le WebP, une bannière
// WebP disparaîtrait du PDF sans prévenir.

export const BANNER_MAX_BYTES = LOGO_MAX_BYTES;
export const BANNER_TYPES = { "image/png": "png", "image/jpeg": "jpg" } as const;
export type BannerType = keyof typeof BANNER_TYPES;
export const BANNER_ACCEPT = Object.keys(BANNER_TYPES).join(",");
// Format conseillé : 4:1 (1600 × 400 px), affiché sur toute la largeur.
export const BANNER_RATIO = 4;

export type BannerError = "banner_too_large" | "banner_type";

function isBannerType(type: string): type is BannerType {
  return Object.hasOwn(BANNER_TYPES, type);
}

export function checkBannerFile(file: { size: number; type: string }): BannerError | null {
  if (file.size > BANNER_MAX_BYTES) return "banner_too_large";
  if (!isBannerType(file.type)) return "banner_type";
  return null;
}

export function checkBannerBytes(bytes: Uint8Array): { error: BannerError } | { type: BannerType } {
  if (bytes.byteLength > BANNER_MAX_BYTES) return { error: "banner_too_large" };
  const type = sniffImageType(bytes);
  return type && isBannerType(type) ? { type } : { error: "banner_type" };
}

export function bannerPath(workspaceId: string, type: BannerType, version: string): string {
  return `${workspaceId}/banner-${version}.${BANNER_TYPES[type]}`;
}

export type CheckedBanner = { bytes: Uint8Array; type: BannerType };

export async function readBannerUpload(value: FormDataEntryValue | null): Promise<{ banner: CheckedBanner | null } | { error: BannerError }> {
  if (!(value instanceof File) || value.size === 0) return { banner: null };
  if (value.size > BANNER_MAX_BYTES) return { error: "banner_too_large" };
  const bytes = new Uint8Array(await value.arrayBuffer());
  const checked = checkBannerBytes(bytes);
  return "error" in checked ? checked : { banner: { bytes, type: checked.type } };
}

// Format d'image pour le moteur PDF, d'après l'extension du chemin enregistré.
export function imageFormat(path: string | null): "png" | "jpg" | null {
  if (!path) return null;
  if (/\.png$/i.test(path)) return "png";
  if (/\.jpe?g$/i.test(path)) return "jpg";
  return null;
}
