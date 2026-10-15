import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { safeNextPath } from "./modules/auth/next-path";

const handleI18n = createIntlMiddleware(routing);

// Pages réservées aux personnes connectées (premier segment après la langue).
const PROTECTED = new Set(["tableau-de-bord", "pipeline", "factures", "contacts", "reglages", "plus", "demarrage"]);

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

  if (!signedIn && PROTECTED.has(section)) {
    const target = new URL(`/${locale}/connexion`, request.url);
    target.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return redirectKeepingCookies(target, response);
  }
  if (signedIn && section === "connexion") {
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/tableau-de-bord";
    return redirectKeepingCookies(new URL(`/${locale}${next}`, request.url), response);
  }
  return response;
}

// Conserve les cookies de session rafraîchis (et l'en-tête Cache-Control posé par Supabase).
function redirectKeepingCookies(target: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(target);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  const cacheControl = from.headers.get("cache-control");
  if (cacheControl) redirect.headers.set("cache-control", cacheControl);
  return redirect;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
