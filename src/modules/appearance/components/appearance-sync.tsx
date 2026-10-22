import { isDefaultAppearance, serializeAppearance, APPEARANCE_COOKIE, APPEARANCE_COOKIE_MAX_AGE } from "../preference";
import { readAppearanceCookie } from "../cookie";
import { getProfileAppearance } from "../queries";

// Pages connectées : si le cookie de cet appareil ne correspond plus au profil (choix fait
// sur un autre appareil, cookie effacé), un court script l'aligne et applique l'apparence.
// Rien n'est rendu dans le cas courant. Aucune attente pour la page (Suspense en amont).
export async function AppearanceSync() {
  const [profile, cookie] = await Promise.all([getProfileAppearance(), readAppearanceCookie()]);
  if (!profile) return null;
  const same = cookie.mode === profile.mode && cookie.palette === profile.palette;
  if (same && (cookie.present || isDefaultAppearance(profile))) return null;
  const value = serializeAppearance(profile);
  const script =
    `document.cookie=${JSON.stringify(`${APPEARANCE_COOKIE}=${value}; path=/; max-age=${APPEARANCE_COOKIE_MAX_AGE}; samesite=lax`)};` +
    `window.__ivnApplyAppearance&&window.__ivnApplyAppearance(${JSON.stringify(profile.mode)},${JSON.stringify(profile.palette)});`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

// Sans JavaScript : feuille de la palette choisie (lue depuis le cookie).
export function AppearanceNoScript() {
  return (
    <noscript>
      {/* Feuille dynamique (cookie), hors du CSS construit : chargée seulement sans JavaScript. */}
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link rel="stylesheet" href="/apparence.css" />
    </noscript>
  );
}
