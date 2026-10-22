// Contraste WCAG 2.x entre deux couleurs « #rrggbb » (1 à 21). Seuils : 4,5 pour du
// texte courant, 3 pour un grand texte, une icône ou le contour d'un champ.

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) throw new Error(`Couleur invalide : ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Texte posé sur un aplat de couleur libre : blanc ou noir, le plus lisible des deux.
// L'un des deux atteint toujours au moins 4,58:1, quelle que soit la couleur.
export function readableTextOn(background: string): "#FFFFFF" | "#000000" {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#000000") ? "#FFFFFF" : "#000000";
}
