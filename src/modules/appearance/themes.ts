// Apparence de l'application (Réglages > Apparence) : mode clair / sombre / automatique et
// couleur principale choisie parmi des palettes vérifiées (pas de couleur libre : le
// contraste de chaque couple texte / fond est contrôlé par themes.test.ts).
//
// Les jetons gardent les noms de la palette Océan d'origine (lagoon, terracotta…) : ce
// sont des rôles. lagoon : titres, liens, contours actifs ; terracotta : bouton principal ;
// turquoise : accents, icônes, badges ; spray : fond ; surface : cartes et champs ;
// chrome : zones sombres (navigation, en-têtes) ; on-* : texte posé sur l'aplat du même nom.
// Ce fichier est la seule source des valeurs : src/app/themes.css en est généré
// (npm run themes:css) et un test vérifie qu'il est à jour.

export const THEME_MODES = ["light", "dark", "auto"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const DEFAULT_MODE: ThemeMode = "light";

export const PALETTES = ["ocean", "foret", "prune", "corail", "ardoise", "sable"] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = "ocean";

export const TOKENS = [
  "spray",
  "surface",
  "sand-light",
  "sand",
  "sand-strong",
  "ink",
  "ink-muted",
  "lagoon",
  "on-lagoon",
  "turquoise",
  "turquoise-soft",
  "on-turquoise",
  "terracotta",
  "terracotta-dark",
  "on-terracotta",
  "chrome",
  "on-chrome",
  "on-chrome-muted",
  "danger",
  "danger-soft",
  "success",
  "success-soft",
] as const;
export type Token = (typeof TOKENS)[number];
type Tokens = Record<Token, string>;

// Couleurs d'état (erreur, succès) communes à toutes les palettes, par mode.
const STATUS_LIGHT = { danger: "#a12a1f", "danger-soft": "#f8e4e1", success: "#1e6b47", "success-soft": "#dcefe4" };
const STATUS_DARK = { danger: "#ff9b8f", "danger-soft": "#3d1a16", success: "#7fd4a5", "success-soft": "#12301f" };

export const PALETTE_COLORS: Record<Palette, { light: Tokens; dark: Tokens }> = {
  // Palette de marque d'origine (docs/spec-mvp.md).
  ocean: {
    light: {
      spray: "#e8edf0",
      surface: "#ffffff",
      "sand-light": "#f4f1ea",
      sand: "#c9c5ba",
      "sand-strong": "#7f7a6e",
      ink: "#0b2a2e",
      "ink-muted": "#45605f",
      lagoon: "#01515a",
      "on-lagoon": "#ffffff",
      turquoise: "#2e99ab",
      "turquoise-soft": "#d5ecf0",
      "on-turquoise": "#0b2a2e",
      terracotta: "#a45c36",
      "terracotta-dark": "#8a4a2a",
      "on-terracotta": "#ffffff",
      chrome: "#01515a",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#c9c5ba",
      ...STATUS_LIGHT,
    },
    dark: {
      spray: "#0b1c1f",
      surface: "#10272b",
      "sand-light": "#143035",
      sand: "#2b4a4f",
      "sand-strong": "#6d8b8e",
      ink: "#e3ecee",
      "ink-muted": "#a5bbbd",
      lagoon: "#7fcad5",
      "on-lagoon": "#0b1c1f",
      turquoise: "#4fb8c9",
      "turquoise-soft": "#123c42",
      "on-turquoise": "#0b1c1f",
      terracotta: "#a45c36",
      "terracotta-dark": "#8a4a2a",
      "on-terracotta": "#ffffff",
      chrome: "#062d33",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#b9c9c7",
      ...STATUS_DARK,
    },
  },
  foret: {
    light: {
      spray: "#e9eee9",
      surface: "#ffffff",
      "sand-light": "#f3f4ed",
      sand: "#c5c8b6",
      "sand-strong": "#767a68",
      ink: "#14271c",
      "ink-muted": "#4a5d50",
      lagoon: "#1f5a3d",
      "on-lagoon": "#ffffff",
      turquoise: "#4f9a6c",
      "turquoise-soft": "#dbeee1",
      "on-turquoise": "#14271c",
      terracotta: "#8f5a1c",
      "terracotta-dark": "#764815",
      "on-terracotta": "#ffffff",
      chrome: "#1f5a3d",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#cdd5c3",
      ...STATUS_LIGHT,
    },
    dark: {
      spray: "#0d1a13",
      surface: "#13251b",
      "sand-light": "#182d21",
      sand: "#2e4537",
      "sand-strong": "#71897a",
      ink: "#e4ede6",
      "ink-muted": "#a8bbad",
      lagoon: "#8fd1a8",
      "on-lagoon": "#0d1a13",
      turquoise: "#62bb85",
      "turquoise-soft": "#173a26",
      "on-turquoise": "#0d1a13",
      terracotta: "#8f5a1c",
      "terracotta-dark": "#764815",
      "on-terracotta": "#ffffff",
      chrome: "#103322",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#bccbbf",
      ...STATUS_DARK,
    },
  },
  prune: {
    light: {
      spray: "#efebf0",
      surface: "#ffffff",
      "sand-light": "#f7f3f5",
      sand: "#cfc5cf",
      "sand-strong": "#7d717e",
      ink: "#2a1530",
      "ink-muted": "#5e4c62",
      lagoon: "#5b2b5e",
      "on-lagoon": "#ffffff",
      turquoise: "#b07ab4",
      "turquoise-soft": "#f0e2f1",
      "on-turquoise": "#2a1530",
      terracotta: "#a23d5a",
      "terracotta-dark": "#86304a",
      "on-terracotta": "#ffffff",
      chrome: "#5b2b5e",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#dcc9dd",
      ...STATUS_LIGHT,
    },
    dark: {
      spray: "#1a1220",
      surface: "#241a2b",
      "sand-light": "#2b2033",
      sand: "#45364d",
      "sand-strong": "#8a7a90",
      ink: "#efe7f1",
      "ink-muted": "#bfaec4",
      lagoon: "#dcaee0",
      "on-lagoon": "#1a1220",
      turquoise: "#c58fca",
      "turquoise-soft": "#3a2541",
      "on-turquoise": "#1a1220",
      terracotta: "#a23d5a",
      "terracotta-dark": "#86304a",
      "on-terracotta": "#ffffff",
      chrome: "#371a3a",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#d2c0d4",
      ...STATUS_DARK,
    },
  },
  corail: {
    light: {
      spray: "#f4ece8",
      surface: "#ffffff",
      "sand-light": "#faf4f0",
      sand: "#d6c6be",
      "sand-strong": "#83726a",
      ink: "#2d1712",
      "ink-muted": "#634c45",
      lagoon: "#7a2e22",
      "on-lagoon": "#ffffff",
      turquoise: "#d0634a",
      "turquoise-soft": "#fbe3dc",
      "on-turquoise": "#1c0d0a",
      terracotta: "#b83f27",
      "terracotta-dark": "#983320",
      "on-terracotta": "#ffffff",
      chrome: "#7a2e22",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#efd0c7",
      ...STATUS_LIGHT,
    },
    dark: {
      spray: "#1e1311",
      surface: "#2a1b18",
      "sand-light": "#32211d",
      sand: "#4d3832",
      "sand-strong": "#927b74",
      ink: "#f4e9e6",
      "ink-muted": "#c9b2ab",
      lagoon: "#f3a896",
      "on-lagoon": "#1e1311",
      turquoise: "#ec8d76",
      "turquoise-soft": "#47251e",
      "on-turquoise": "#1e1311",
      terracotta: "#b83f27",
      "terracotta-dark": "#983320",
      "on-terracotta": "#ffffff",
      chrome: "#4a1d16",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#e2c6be",
      ...STATUS_DARK,
    },
  },
  ardoise: {
    light: {
      spray: "#e9ecef",
      surface: "#ffffff",
      "sand-light": "#f3f4f6",
      sand: "#c4c9cf",
      "sand-strong": "#717980",
      ink: "#18222c",
      "ink-muted": "#4e5a66",
      lagoon: "#2f4659",
      "on-lagoon": "#ffffff",
      turquoise: "#6f91b0",
      "turquoise-soft": "#e0e8f0",
      "on-turquoise": "#18222c",
      terracotta: "#2d6a8f",
      "terracotta-dark": "#245675",
      "on-terracotta": "#ffffff",
      chrome: "#2f4659",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#c9d3dc",
      ...STATUS_LIGHT,
    },
    dark: {
      spray: "#11161b",
      surface: "#182028",
      "sand-light": "#1d2630",
      sand: "#34414d",
      "sand-strong": "#7a8794",
      ink: "#e7ecf1",
      "ink-muted": "#aab6c2",
      lagoon: "#a9c4dc",
      "on-lagoon": "#11161b",
      turquoise: "#86a8c7",
      "turquoise-soft": "#22303d",
      "on-turquoise": "#11161b",
      terracotta: "#2d6a8f",
      "terracotta-dark": "#245675",
      "on-terracotta": "#ffffff",
      chrome: "#1c2a36",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#bcc8d3",
      ...STATUS_DARK,
    },
  },
  sable: {
    light: {
      spray: "#f1ede5",
      surface: "#ffffff",
      "sand-light": "#f9f6ef",
      sand: "#d3c9b6",
      "sand-strong": "#7f7562",
      ink: "#2a2014",
      "ink-muted": "#5c5140",
      lagoon: "#634826",
      "on-lagoon": "#ffffff",
      turquoise: "#a87a34",
      "turquoise-soft": "#f3e7d2",
      "on-turquoise": "#140f08",
      terracotta: "#8a4f22",
      "terracotta-dark": "#723f19",
      "on-terracotta": "#ffffff",
      chrome: "#634826",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#e2d5bf",
      ...STATUS_LIGHT,
    },
    dark: {
      spray: "#1b1610",
      surface: "#251e16",
      "sand-light": "#2c241a",
      sand: "#473b2c",
      "sand-strong": "#8d806c",
      ink: "#f2ebdf",
      "ink-muted": "#c6b9a4",
      lagoon: "#e3c38e",
      "on-lagoon": "#1b1610",
      turquoise: "#d4a961",
      "turquoise-soft": "#3d3020",
      "on-turquoise": "#1b1610",
      terracotta: "#8a4f22",
      "terracotta-dark": "#723f19",
      "on-terracotta": "#ffffff",
      chrome: "#3d2c16",
      "on-chrome": "#ffffff",
      "on-chrome-muted": "#d9cbb3",
      ...STATUS_DARK,
    },
  },
};

// Couples vérifiés pour chaque palette et chaque mode (themes.test.ts). min 4,5 : texte ;
// 3 : grand texte, icône, contour de champ, anneau de focus.
export const CONTRAST_PAIRS: { fg: Token; bg: Token; min: number }[] = [
  ...(["spray", "surface", "sand-light"] as const).flatMap((bg) => [
    { fg: "ink" as const, bg, min: 7 },
    { fg: "ink-muted" as const, bg, min: 4.5 },
    { fg: "lagoon" as const, bg, min: 4.5 },
    { fg: "danger" as const, bg, min: 4.5 },
    { fg: "success" as const, bg, min: 4.5 },
  ]),
  // Icônes et barres d'avancement (posées sur les cartes) ; le bouton principal porte son
  // texte (on-terracotta), son aplat n'a pas d'exigence de contraste avec le fond.
  { fg: "turquoise", bg: "surface", min: 3 },
  { fg: "sand-strong", bg: "surface", min: 3 },
  { fg: "sand-strong", bg: "spray", min: 3 },
  { fg: "on-lagoon", bg: "lagoon", min: 4.5 },
  { fg: "on-turquoise", bg: "turquoise", min: 4.5 },
  { fg: "ink", bg: "turquoise-soft", min: 4.5 },
  { fg: "lagoon", bg: "turquoise-soft", min: 4.5 },
  { fg: "on-terracotta", bg: "terracotta", min: 4.5 },
  { fg: "on-terracotta", bg: "terracotta-dark", min: 4.5 },
  { fg: "on-chrome", bg: "chrome", min: 4.5 },
  { fg: "on-chrome-muted", bg: "chrome", min: 4.5 },
  { fg: "danger", bg: "danger-soft", min: 4.5 },
  { fg: "success", bg: "success-soft", min: 4.5 },
  { fg: "surface", bg: "success", min: 4.5 },
];

// Couleur de la barre du navigateur (meta theme-color) : celle des zones sombres.
export function themeColor(palette: Palette, dark: boolean): string {
  return PALETTE_COLORS[palette][dark ? "dark" : "light"].chrome;
}

function declarations(tokens: Tokens, scheme: "light" | "dark"): string {
  return [`color-scheme: ${scheme};`, ...TOKENS.map((t) => `--color-${t}: ${tokens[t]};`)].join(" ");
}

// Feuille de toutes les palettes, sur tout élément qui porte data-palette / data-mode
// (<html> de l'application ; le cadre des pages publiques se remet en Océan clair).
export function themesCss(): string {
  const lines = ["/* Généré par src/modules/appearance/themes.ts (npm run themes:css). Ne pas modifier. */"];
  for (const palette of PALETTES) {
    const { light, dark } = PALETTE_COLORS[palette];
    lines.push(`[data-palette="${palette}"] { ${declarations(light, "light")} }`);
    lines.push(`[data-palette="${palette}"][data-mode="dark"] { ${declarations(dark, "dark")} }`);
  }
  lines.push("@media (prefers-color-scheme: dark) {");
  for (const palette of PALETTES) {
    lines.push(`  [data-palette="${palette}"][data-mode="auto"] { ${declarations(PALETTE_COLORS[palette].dark, "dark")} }`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

// Sans JavaScript (feuille /apparence.css) : la palette choisie posée sur :root.
export function rootThemeCss(mode: ThemeMode, palette: Palette): string {
  const { light, dark } = PALETTE_COLORS[palette];
  if (mode === "light") return `:root:root { ${declarations(light, "light")} }\n`;
  if (mode === "dark") return `:root:root { ${declarations(dark, "dark")} }\n`;
  return `:root:root { ${declarations(light, "light")} }\n@media (prefers-color-scheme: dark) { :root:root { ${declarations(dark, "dark")} } }\n`;
}
