"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { dbErrorKey } from "@/lib/db-errors";
import { formValues, parseWith } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/modules/auth/next-path";
import { readLogoUpload } from "@/modules/workspace/logo";
import { ONBOARDING_PROFILE_FIELDS, onboardingProfileSchema } from "@/modules/workspace/profile-schema";
import { removeLogo, saveProfile, uploadLogo } from "@/modules/workspace/save-profile";
import type { ProfileFormState } from "@/modules/workspace/actions";
import { DIAGNOSTIC_FIELDS } from "./diagnostic-fields";
import { diagnosticSchema } from "./diagnostic-schema";
import { levelFromClients } from "./level";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

// Fin de l'accueil guidé : diagnostic + profil pro envoyés ensemble (les deux étapes
// restent dans le même formulaire). Ordre voulu :
// 1. tout est vérifié (logo compris, d'après son contenu) avant la moindre écriture ;
// 2. workspace (create_workspace, idempotent : un nouvel essai reprend le même),
//    diagnostic, logo ;
// 3. en dernier, le profil (saveProfile), dont la mise à jour pose onboarded_at.
// NIF, STAT et régime fiscal ne sont pas demandés ici : seulement avant la première facture.
// Un échec avant l'étape 3 laisse l'accueil guidé ouvert : rien n'est perdu au nouvel essai.
export async function completeOnboarding(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: "/connexion?next=/demarrage", locale });

  const diagnostic = parseWith(diagnosticSchema, formValues(formData, DIAGNOSTIC_FIELDS));
  const profile = parseWith(onboardingProfileSchema, formValues(formData, ONBOARDING_PROFILE_FIELDS));
  const logo = await readLogoUpload(formData.get("logo"));
  if (!diagnostic.ok || !profile.ok || "error" in logo) {
    return {
      fieldErrors: {
        ...(diagnostic.ok ? {} : diagnostic.fieldErrors),
        ...(profile.ok ? {} : profile.fieldErrors),
        ...("error" in logo ? { logo: logo.error } : {}),
      },
      formError: "fix_errors",
    };
  }

  const { data: workspaceId, error: createError } = await supabase.rpc("create_workspace", {
    name: profile.data.name,
    default_currency: profile.data.default_currency,
    trade: profile.data.trade,
  });
  if (createError || !workspaceId) return { formError: dbErrorKey(createError) };

  const { error: answersError } = await supabase.from("onboarding_answers").upsert(
    {
      workspace_id: workspaceId,
      answers: { trade: profile.data.trade, ...diagnostic.data },
      completed_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (answersError) return { formError: dbErrorKey(answersError) };

  // Logo d'un essai précédent (interrompu) : remplacé par le nouveau.
  let previousLogo: string | null = null;
  let logoPath: string | undefined;
  if (logo.logo) {
    const { data: current } = await supabase.from("workspaces").select("logo_path").eq("id", workspaceId).single();
    previousLogo = current?.logo_path ?? null;
    const uploaded = await uploadLogo(supabase, workspaceId, logo.logo);
    if (!uploaded) return { fieldErrors: { logo: "logo_upload" }, formError: "fix_errors" };
    logoPath = uploaded;
  }

  const level = levelFromClients(diagnostic.data.current_clients);
  const profileError = await saveProfile(supabase, workspaceId, profile.data, { level, logoPath });
  if (profileError) {
    await removeLogo(supabase, logoPath);
    return { formError: profileError };
  }
  if (logoPath) await removeLogo(supabase, previousLogo);

  return redirect({ href: next ?? "/tableau-de-bord", locale });
}
