import { contrastRatio, HEX_COLOR, readableTextOn } from "@/lib/contrast";

// Image de marque des devis et factures (Réglages > Image de marque), propre au workspace,
// appliquée au PDF et à la page publique. Copiée dans la copie figée de chaque document à
// son émission (freelancer.brand) : un document envoyé garde la marque de son envoi.

export const BRAND_FONTS = ["liberation-sans", "montserrat", "nunito", "spectral", "barlow-condensed"] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

// family : nom de la police dans le PDF (fichiers de src/modules/billing/fonts) ;
// css : pile de la page publique (@font-face dans globals.css, mêmes fichiers en WOFF2).
export const FONT_FAMILIES: Record<BrandFont, { family: string; files: [string, string]; css: string }> = {
  "liberation-sans": {
    family: "Liberation Sans",
    files: ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf"],
    css: '"Ivonea Classique", "Liberation Sans", Arial, Helvetica, sans-serif',
  },
  montserrat: {
    family: "Montserrat",
    files: ["Montserrat-Regular.ttf", "Montserrat-Bold.ttf"],
    css: '"Montserrat", system-ui, sans-serif',
  },
  nunito: { family: "Nunito", files: ["Nunito-Regular.ttf", "Nunito-Bold.ttf"], css: '"Nunito", system-ui, sans-serif' },
  spectral: { family: "Spectral", files: ["Spectral-Regular.ttf", "Spectral-Bold.ttf"], css: '"Spectral", Georgia, serif' },
  "barlow-condensed": {
    family: "Barlow Condensed",
    files: ["BarlowCondensed-Regular.ttf", "BarlowCondensed-Bold.ttf"],
    css: '"Barlow Condensed", "Arial Narrow", sans-serif',
  },
};

export const LOGO_SIZES = ["small", "medium", "large"] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
export const LOGO_POSITIONS = ["left", "center"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

// Hauteur du logo dans le PDF (points) et sur la page publique (pixels).
export const LOGO_PDF_SIZE: Record<LogoSize, number> = { small: 36, medium: 52, large: 76 };
export const LOGO_WEB_SIZE: Record<LogoSize, number> = { small: 40, medium: 56, large: 80 };

export type Brand = {
  showLogo: boolean;
  logoSize: LogoSize;
  logoPosition: LogoPosition;
  bannerPath: string | null;
  primary: string;
  accent: string;
  font: BrandFont;
};

// Couleurs proposées (choix libre possible). Océan : la marque d'origine, par défaut.
export const COLOR_PRESETS = [
  { key: "ocean", primary: "#01515A", accent: "#A45C36" },
  { key: "foret", primary: "#1F5A3D", accent: "#C9822B" },
  { key: "prune", primary: "#5B2B5E", accent: "#D4A24C" },
  { key: "nuit", primary: "#1E2A4A", accent: "#E07A5F" },
  { key: "ardoise", primary: "#2F4659", accent: "#2E99AB" },
  { key: "encre", primary: "#1A1A1A", accent: "#C0392B" },
] as const;

export const DEFAULT_BRAND: Brand = {
  showLogo: true,
  logoSize: "medium",
  logoPosition: "left",
  bannerPath: null,
  primary: COLOR_PRESETS[0].primary,
  accent: COLOR_PRESETS[0].accent,
  font: "liberation-sans",
};

// Fonds clairs sur lesquels la couleur principale sert de texte (titres, nom, liens) :
// blanc, sable clair (cartes) et le fond de la page publique.
export const LIGHT_SURFACES = ["#FFFFFF", "#F4F1EA", "#E8EDF0"] as const;

// Choix retenu : une couleur principale trop claire pour un texte lisible (< 4,5:1 sur l'un
// de ces fonds) est refusée avec un message clair, car elle sert aussi de texte et aucun
// réglage automatique ne rendrait ces titres lisibles. Sur ses aplats (en-tête du
// tableau, total), le texte est blanc ou noir, le plus lisible (readableTextOn). L'accent
// n'est jamais du texte sur fond clair : toute couleur est acceptée (les accents chauds,
// or, corail, sont au cœur de nombreuses marques et tomberaient sous 3:1), son texte est
// choisi de la même façon. Un accent trop pâle (< 3:1 sur l'un de ces fonds) reçoit un
// contour à la couleur principale là où il délimite un élément : le bouton du client
// sur la page publique, l'aplat « Reste à payer » du PDF (WCAG 1.4.11, 3:1).
export function primaryContrast(primary: string): number {
  return Math.min(...LIGHT_SURFACES.map((surface) => contrastRatio(primary, surface)));
}

export function isReadablePrimary(primary: string): boolean {
  return primaryContrast(primary) >= 4.5;
}

export function accentContrast(accent: string): number {
  return Math.min(...LIGHT_SURFACES.map((surface) => contrastRatio(accent, surface)));
}

// accentEdge : contour des éléments à l'accent, null s'il se distingue seul du fond (≥ 3:1).
export type BrandColors = { primary: string; onPrimary: string; accent: string; onAccent: string; accentEdge: string | null };

export function brandColors(brand: Pick<Brand, "primary" | "accent">): BrandColors {
  // Copie figée ancienne ou modifiée à la main : une couleur illisible revient au défaut.
  const primary = isReadablePrimary(brand.primary) ? brand.primary : DEFAULT_BRAND.primary;
  return {
    primary,
    onPrimary: readableTextOn(primary),
    accent: brand.accent,
    onAccent: readableTextOn(brand.accent),
    accentEdge: accentContrast(brand.accent) >= 3 ? null : primary,
  };
}

// « #abc123 », « abc123 » → « #ABC123 » ; autre chose → null.
export function normalizeHex(value: string): string | null {
  const hex = value.trim().replace(/^#?/, "#").toUpperCase();
  return HEX_COLOR.test(hex) ? hex : null;
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

// Copie figée (freelancer.brand, colonnes du workspace en snake_case) → Brand. Les
// documents émis avant cette fonctionnalité n'en ont pas : marque par défaut (leur aspect
// d'origine).
export function parseBrand(value: unknown): Brand {
  if (typeof value !== "object" || value === null) return DEFAULT_BRAND;
  const v = value as Record<string, unknown>;
  return {
    showLogo: typeof v.show_logo === "boolean" ? v.show_logo : DEFAULT_BRAND.showLogo,
    logoSize: oneOf(LOGO_SIZES, v.logo_size, DEFAULT_BRAND.logoSize),
    logoPosition: oneOf(LOGO_POSITIONS, v.logo_position, DEFAULT_BRAND.logoPosition),
    bannerPath: typeof v.banner_path === "string" && v.banner_path ? v.banner_path : null,
    primary: (typeof v.primary_color === "string" && normalizeHex(v.primary_color)) || DEFAULT_BRAND.primary,
    accent: (typeof v.accent_color === "string" && normalizeHex(v.accent_color)) || DEFAULT_BRAND.accent,
    font: oneOf(BRAND_FONTS, v.font, DEFAULT_BRAND.font),
  };
}

// Colonnes du workspace → même forme que la copie figée (brouillons, aperçu).
export function brandSnapshot(workspace: {
  brand_show_logo: boolean;
  brand_logo_size: string;
  brand_logo_position: string;
  brand_banner_path: string | null;
  brand_primary_color: string;
  brand_accent_color: string;
  brand_font: string;
}): BrandSnapshot {
  return {
    show_logo: workspace.brand_show_logo,
    logo_size: workspace.brand_logo_size,
    logo_position: workspace.brand_logo_position,
    banner_path: workspace.brand_banner_path,
    primary_color: workspace.brand_primary_color,
    accent_color: workspace.brand_accent_color,
    font: workspace.brand_font,
  };
}

export type BrandSnapshot = {
  show_logo: boolean;
  logo_size: string;
  logo_position: string;
  banner_path: string | null;
  primary_color: string;
  accent_color: string;
  font: string;
};
