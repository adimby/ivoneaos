import { DEFAULT_MODE, DEFAULT_PALETTE, PALETTES, THEME_MODES, themeColor, type Palette, type ThemeMode } from "./themes";

// Apparence choisie : enregistrée dans le profil (source de vérité, suit la personne d'un
// appareil à l'autre) et recopiée dans un cookie lisible par la page (« dark.foret »).
// Le cookie sert à l'affichage avant le premier rendu, sans requête : la coquille des pages
// reste statique (Cache Components), un script en tête de <html> pose data-mode et
// data-palette avant la première peinture. Sans JavaScript, la feuille /apparence.css
// (lue depuis le même cookie) applique la palette.

export const APPEARANCE_COOKIE = "ivn_apparence";
export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Appearance = { mode: ThemeMode; palette: Palette };
export const DEFAULT_APPEARANCE: Appearance = { mode: DEFAULT_MODE, palette: DEFAULT_PALETTE };

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && (PALETTES as readonly string[]).includes(value);
}

export function serializeAppearance({ mode, palette }: Appearance): string {
  return `${mode}.${palette}`;
}

export function parseAppearance(value: string | null | undefined): Appearance {
  const [mode, palette] = (value ?? "").split(".");
  return {
    mode: isThemeMode(mode) ? mode : DEFAULT_MODE,
    palette: isPalette(palette) ? palette : DEFAULT_PALETTE,
  };
}

export function isDefaultAppearance(appearance: Appearance): boolean {
  return appearance.mode === DEFAULT_MODE && appearance.palette === DEFAULT_PALETTE;
}

// Pages publiques (/fr/p/…) : jamais au thème de la freelance qui les ouvre.
export const PUBLIC_PATH = /^\/[a-z]{2}\/p(\/|$)/;

// Couleurs de la barre du navigateur par palette : [clair, sombre].
const THEME_COLORS = Object.fromEntries(PALETTES.map((p) => [p, [themeColor(p, false), themeColor(p, true)]]));

// Script en tête de <html> (avant toute peinture) : lit le cookie, pose les attributs et
// la couleur de la barre du navigateur, gardée ensuite : Next réécrit la balise meta à
// chaque navigation (observation de <head> seulement), et en mode Automatique elle suit
// le changement de mode du système. Valeurs inconnues ignorées (défaut Océan clair).
// Exposé en window.__ivnApplyAppearance pour le formulaire de Réglages et la
// synchronisation, et en window.__ivnSyncAppearance (relit le cookie, défaut s'il est
// absent) pour les navigations sans rechargement : connexion, déconnexion.
export const APPEARANCE_SCRIPT = `(function(){var C=${JSON.stringify(THEME_COLORS)},M=${JSON.stringify(THEME_MODES)},cur=null;
function color(){var d=cur.m==="dark"||(cur.m==="auto"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);return C[cur.p][d?1:0]}
function meta(){if(!cur)return;var e=document.querySelector('meta[name="theme-color"]'),c=color();if(e&&e.getAttribute("content")!==c)e.setAttribute("content",c)}
function apply(m,p){if(M.indexOf(m)<0||!C[p])return;var h=document.documentElement;h.setAttribute("data-mode",m);h.setAttribute("data-palette",p);
var first=!cur;cur={m:m,p:p};meta();if(!first)return;
if(window.MutationObserver&&document.head)new window.MutationObserver(meta).observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:["content"]});
var q=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)");if(q&&q.addEventListener)q.addEventListener("change",meta)}
function read(){return document.cookie.match(/(?:^|; )${APPEARANCE_COOKIE}=([a-z]+)\\.([a-z]+)/)}
window.__ivnApplyAppearance=apply;
window.__ivnSyncAppearance=function(){try{var v=read();if(v&&M.indexOf(v[1])>=0&&C[v[2]])apply(v[1],v[2]);else if(cur)apply(${JSON.stringify(DEFAULT_MODE)},${JSON.stringify(DEFAULT_PALETTE)})}catch(e){}};
try{if(${PUBLIC_PATH}.test(location.pathname))return;var v=read();if(v)apply(v[1],v[2])}catch(e){}})();`;
