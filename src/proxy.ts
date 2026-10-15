import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { safeNextPath } from "./modules/auth/next-path";

const handleI18n = createIntlMiddleware(routing);

// Pages réservées aux personnes connectées (premier segment après la langue).
const PROTECTED = new Set(["tableau-de-bord", "pipeline", "factures", "devis", "contacts", "reglages", "plus", "demarrage"]);
// Page publique /fr/p/<jeton> (pas le PDF /p/<jeton>/pdf, qui répond 404 lui-même).
const PUBLIC_PAGE = /^\/[a-z]{2}\/p\/([^/]+)\/?$/;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export default async function proxy(request: NextRequest) {
  const response = handleI18n(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  // Rafraîchit la session Supabase une fois par navigation.
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value),
        );
      },
    },
  });
  const { data } = await supabase.auth.getClaims();

  // Redirection de langue (« / » → « /fr ») : rien d'autre à décider ici.
  if (response.headers.has("location")) return response;

  // Contrôle optimiste (la page revérifie la session et la base filtre par RLS).
  const [, locale, section] = request.nextUrl.pathname.split("/");
  if (!hasLocale(routing.locales, locale)) return response;
  const signedIn = Boolean(data?.claims);

  // Action serveur (POST avec l'en-tête next-action) : jamais redirigée ici. Une
  // redirection casserait la réponse attendue par la page ; l'action revérifie la
  // session et renvoie elle-même vers /connexion?next=… si elle a expiré.
  if (request.method === "POST" && request.headers.has("next-action")) return response;

  // Page publique d'un document : un jeton inconnu ou un brouillon répond 404 avant tout
  // envoi (une page qui s'affiche en streaming part en 200). Une requête légère ; en cas
  // d'erreur de la base, la page décide elle-même.
  if (section === "p" && request.method === "GET") {
    const token = PUBLIC_PAGE.exec(request.nextUrl.pathname)?.[1];
    if (token !== undefined) {
      const { data: exists, error } = TOKEN.test(token)
        ? await supabase.rpc("public_document_exists", { token })
        : { data: false, error: null };
      if (!error && !exists) {
        return keepingCookies(NextResponse.rewrite(new URL(`/${locale}/p/introuvable`, request.url)), response);
      }
    }
  }

  if (!signedIn && PROTECTED.has(section)) {
    const target = new URL(`/${locale}/connexion`, request.url);
    target.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return keepingCookies(NextResponse.redirect(target), response);
  }
  if (signedIn && section === "connexion") {
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/tableau-de-bord";
    return keepingCookies(NextResponse.redirect(new URL(`/${locale}${next}`, request.url)), response);
  }
  return response;
}

// Conserve les cookies de session rafraîchis (et l'en-tête Cache-Control posé par Supabase).
function keepingCookies(to: NextResponse, from: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  const cacheControl = from.headers.get("cache-control");
  if (cacheControl) to.headers.set("cache-control", cacheControl);
  return to;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
