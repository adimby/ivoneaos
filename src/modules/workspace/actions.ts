"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { formValues, parseWith, type FieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { readLogoUpload } from "./logo";
import { PROFILE_FIELDS, profileSchema } from "./profile-schema";
import { removeLogo, saveProfile, uploadLogo } from "./save-profile";

export type ProfileFormState = {
  status?: "saved";
  // Change à chaque enregistrement réussi : le champ logo est alors vidé (pas de renvoi).
  savedAt?: number;
  fieldErrors?: FieldErrors;
  // Clé errors.db.* (erreur de la base) ou FormErrors.fix_errors.
  formError?: string;
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

// Réglages : modification du profil pro (mêmes règles que l'accueil guidé).
export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: "/connexion?next=/reglages", locale });

  // Tout est vérifié (logo compris, d'après son contenu) avant la moindre écriture.
  const parsed = parseWith(profileSchema, formValues(formData, PROFILE_FIELDS));
  const logo = await readLogoUpload(formData.get("logo"));
  if (!parsed.ok || "error" in logo) {
    return {
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...("error" in logo ? { logo: logo.error } : {}) },
      formError: "fix_errors",
    };
  }

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, logo_path")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return { formError: "unknown" };
  if (!workspace) return redirect({ href: "/demarrage", locale });

  const logoPath = logo.logo ? await uploadLogo(supabase, workspace.id, logo.logo) : undefined;
  if (logoPath === null) return { fieldErrors: { logo: "logo_upload" }, formError: "fix_errors" };

  const dbError = await saveProfile(supabase, workspace.id, parsed.data, { logoPath });
  if (dbError) {
    await removeLogo(supabase, logoPath);
    return { formError: dbError };
  }
  if (logoPath) await removeLogo(supabase, workspace.logo_path);

  refresh();
  return { status: "saved", savedAt: Date.now() };
}
