"use server";

import { redirect as redirectExternal } from "next/navigation";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { appOrigin } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, isOnboarded } from "@/modules/workspace/queries";
import { connectPapi, disconnectPapi } from "./papi/service";
import { startWhopOnboarding } from "./whop/service";

const PAGE = "/reglages/paiements";
const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

async function context(formData: FormData) {
  const locale: Locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: `/connexion?next=${encodeURIComponent(PAGE)}`, locale });
  const workspace = await getCurrentWorkspace();
  if (!workspace || !isOnboarded(workspace)) return redirect({ href: "/demarrage", locale });
  const email = typeof claims.claims.email === "string" ? claims.claims.email : null;
  return { locale, workspace, email };
}

// Clé API et secret de signature collés par la freelance : vérifiés auprès de Papi,
// chiffrés, jamais réaffichés. Le résultat s'affiche en clair sur la page (?papi=…).
export async function connectPapiAccount(formData: FormData) {
  const { locale, workspace } = await context(formData);
  const apiKey = String(formData.get("api_key") ?? "").trim();
  const secret = String(formData.get("signing_secret") ?? "").trim();
  let result: string;
  try {
    result = await connectPapi(workspace.id, apiKey, secret);
  } catch (error) {
    console.error("[papi] connexion non enregistrée", error instanceof Error ? error.message : "");
    result = "error";
  }
  redirect({ href: `${PAGE}?papi=${result}`, locale });
}

export async function disconnectPapiAccount(formData: FormData) {
  const { locale, workspace } = await context(formData);
  let result = "disconnected";
  try {
    if (!(await disconnectPapi(workspace.id))) result = "disabled";
  } catch (error) {
    console.error("[papi] déconnexion impossible", error instanceof Error ? error.message : "");
    result = "error";
  }
  redirect({ href: `${PAGE}?papi=${result}`, locale });
}

// Paiement par carte (Whop, factures EUR/USD) : compte connecté créé au nom du workspace,
// puis inscription (identité, coordonnées bancaires) sur la page hébergée par Whop.
export async function connectWhopAccount(formData: FormData) {
  const { locale, workspace, email } = await context(formData);
  if (!email) return redirect({ href: `${PAGE}?whop=error`, locale });
  const origin = await appOrigin();
  let url: string | null = null;
  let result = "error";
  try {
    const started = await startWhopOnboarding(workspace, {
      email,
      returnUrl: `${origin}/${locale}${PAGE}/whop`,
      refreshUrl: `${origin}/${locale}${PAGE}?whop=expired`,
    });
    if (started.status === "redirect") url = started.url;
    else result = started.reason === "disabled" ? "disabled" : "unavailable";
  } catch (error) {
    console.error("[whop] inscription non démarrée", error instanceof Error ? error.message : "");
  }
  if (url) redirectExternal(url);
  redirect({ href: `${PAGE}?whop=${result}`, locale });
}
