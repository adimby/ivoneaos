"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { dbErrorKey } from "@/lib/db-errors";
import { formValues, parseWith, type FieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/modules/auth/next-path";
import { readLogoUpload } from "@/modules/workspace/logo";
import { removeLogo, uploadLogo } from "@/modules/workspace/save-profile";
import { levelFromClients } from "./level";
import { ACTIVITY_FIELDS, activitySchema, PROFILE_STEP_FIELDS, profileStepSchema } from "./step-schemas";

export type StepState = {
  status?: "saved";
  // Change à chaque enregistrement réussi : l'écran passe alors à l'étape suivante.
  savedAt?: number;
  workspaceId?: string;
  fieldErrors?: FieldErrors;
  // Clé errors.db.* (erreur de la base) ou FormErrors.fix_errors.
  formError?: string;
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

async function signedInClient(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: "/connexion?next=/demarrage", locale });
  return { supabase, locale };
}

// Étape 1 « Ton activité » : métier et diagnostic enregistrés tout de suite (reprise après
// un rechargement). Le workspace est créé ici (create_workspace, idempotent) avec le
// métier comme nom provisoire : la base exige un nom, le vrai nom commercial vient à
// l'étape 2 (le champ n'est pas prérempli avec ce nom provisoire). Sans adresse, le
// démarrage reste ouvert (onboarded_at non posé).
export async function saveActivity(_prev: StepState, formData: FormData): Promise<StepState> {
  const { supabase } = await signedInClient(formData);
  const parsed = parseWith(activitySchema, formValues(formData, ACTIVITY_FIELDS));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };
  const { trade, ...diagnostic } = parsed.data;

  const { data: workspaceId, error: createError } = await supabase.rpc("create_workspace", { name: trade, trade });
  if (createError || !workspaceId) return { formError: dbErrorKey(createError) };

  // Workspace existant (retour à l'étape 1) : métier et niveau mis à jour.
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ trade, level: levelFromClients(diagnostic.current_clients) })
    .eq("id", workspaceId);
  if (updateError) return { formError: dbErrorKey(updateError) };

  const { error: answersError } = await supabase
    .from("onboarding_answers")
    .upsert({ workspace_id: workspaceId, answers: { trade, ...diagnostic }, completed_at: null }, { onConflict: "workspace_id" });
  if (answersError) return { formError: dbErrorKey(answersError) };

  return { status: "saved", savedAt: Date.now(), workspaceId };
}

// Étape 2 « Ton profil et ta marque ». Tout est vérifié (logo compris, d'après son
// contenu) avant la moindre écriture ; puis logo, puis une seule mise à jour du workspace
// (profil + marque), qui pose onboarded_at (base) : l'application est ouverte, même si la
// personne s'arrête là.
export async function saveProfileStep(_prev: StepState, formData: FormData): Promise<StepState> {
  const { supabase, locale } = await signedInClient(formData);
  const parsed = parseWith(profileStepSchema, formValues(formData, PROFILE_STEP_FIELDS));
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
  // Étape 1 jamais enregistrée (autre onglet, session changée) : on y retourne.
  if (!workspace) return redirect({ href: "/demarrage", locale });

  const logoPath = logo.logo ? await uploadLogo(supabase, workspace.id, logo.logo) : undefined;
  if (logoPath === null) return { fieldErrors: { logo: "logo_upload" }, formError: "fix_errors" };

  const data = parsed.data;
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      name: data.name,
      trade: data.trade,
      address: data.address,
      default_currency: data.default_currency,
      brand_primary_color: data.primary_color,
      brand_accent_color: data.accent_color,
      brand_font: data.font,
      ...(logoPath && { logo_path: logoPath }),
    })
    .eq("id", workspace.id);
  if (updateError) {
    await removeLogo(supabase, logoPath);
    return { formError: dbErrorKey(updateError) };
  }
  // Logo remplacé (retour à l'étape 2, essai précédent) : l'ancien est supprimé.
  if (logoPath) await removeLogo(supabase, workspace.logo_path);

  return { status: "saved", savedAt: Date.now(), workspaceId: workspace.id };
}

// Fin du démarrage : étape 3 terminée ou « Plus tard ». Formulaire simple (marche sans
// JavaScript), puis la page demandée avant la connexion ou le tableau de bord.
export async function finishOnboarding(formData: FormData) {
  const { supabase, locale } = await signedInClient(formData);
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, onboarded_at")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  // Profil pas encore enregistré : le démarrage reprend à la bonne étape.
  if (!workspace?.onboarded_at) return redirect({ href: "/demarrage", locale });
  await supabase
    .from("onboarding_answers")
    .update({ completed_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id)
    .is("completed_at", null);
  return redirect({ href: next ?? "/tableau-de-bord", locale });
}
