"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, isOnboarded } from "@/modules/workspace/queries";
import { connectPapi, disconnectPapi } from "./papi/service";

const PAGE = "/reglages/paiements";
const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

async function context(formData: FormData) {
  const locale: Locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: `/connexion?next=${encodeURIComponent(PAGE)}`, locale });
  const workspace = await getCurrentWorkspace();
  if (!workspace || !isOnboarded(workspace)) return redirect({ href: "/demarrage", locale });
  return { locale, workspace };
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
