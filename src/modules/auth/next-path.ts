import { routing } from "@/i18n/routing";

// Chemin de retour après connexion (?next=), sans la langue : uniquement une page de
// l'application, jamais une autre origine (« //exemple.com », « /\exemple.com », schémas).
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value)) return null;
  let path = value;
  for (const locale of routing.locales) {
    if (path === `/${locale}`) return null;
    if (path.startsWith(`/${locale}/`)) {
      path = path.slice(locale.length + 1);
      break;
    }
  }
  if (path.startsWith("//") || path.startsWith("/connexion")) return null;
  return path;
}
