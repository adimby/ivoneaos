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
import { optionalFiscalSchema } from "@/modules/workspace/profile-schema";
import { levelFromClients } from "./level";
import { ACTIVITY_FIELDS, activitySchema, PROFILE_STEP_FIELDS, profileStepSchema } from "./step-schemas";
import { resumeStep } from "./steps";

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

type Client = Awaited<ReturnType<typeof createClient>>;

// Démarrage déjà terminé (même règle que la page, src/modules/onboarding/steps.ts) : un
// envoi depuis une page restée en cache (bouton Retour) ne réécrit rien, il mène à la page
// demandée avant la connexion ou au tableau de bord. Sinon : le workspace (ou null).
async function workspaceUnlessDone(supabase: Client, formData: FormData, locale: string) {
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, logo_path, onboarded_at, fiscal_status")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return { error };
  const { data: answers, error: answersError } = workspace
    ? await supabase.from("onboarding_answers").select("completed_at").eq("workspace_id", workspace.id).maybeSingle()
    : { data: null, error: null };
  if (answersError) return { error: answersError };
  if (resumeStep(workspace, answers && { completedAt: answers.completed_at }) === "done") {
    const next = safeNextPath(String(formData.get("next") ?? ""));
    return redirect({ href: next ?? "/tableau-de-bord", locale });
  }
  return { workspace };
}

// Envoi classique (avant le chargement du JavaScript : pas de champ js) : la page est
// rechargée par une redirection vers /demarrage, qui s'ouvre à l'étape calculée par le
// serveur ; une erreur y est montrée (?erreur=), les champs obligatoires et les nombres
// étant déjà contrôlés par le navigateur. Une page rendue en réponse directe au POST
// arriverait sans sa coquille statique (Next 16, Cache Components) : page blanche.
function classicSubmit(formData: FormData, locale: string, state: StepState): StepState {
  if (formData.get("js") === "1") return state;
  const params = new URLSearchParams();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (next) params.set("next", next);
  // Champs en erreur non signalés après la redirection : message général.
  if (state.status !== "saved") params.set("erreur", !state.formError || state.formError === "fix_errors" ? "check_answers" : state.formError);
  return redirect({ href: params.size > 0 ? `/demarrage?${params}` : "/demarrage", locale });
}

// Étape 1 « Ton activité » : métier et diagnostic enregistrés tout de suite (reprise après
// un rechargement). Le workspace est créé ici (create_workspace, idempotent) avec le
// métier comme nom provisoire : la base exige un nom, le vrai nom commercial vient à
// l'étape 2 (le champ n'est pas prérempli avec ce nom provisoire). Sans adresse, le
// démarrage reste ouvert (onboarded_at non posé).
export async function saveActivity(_prev: StepState, formData: FormData): Promise<StepState> {
  const { supabase, locale } = await signedInClient(formData);
  return classicSubmit(formData, locale, await activity(supabase, formData, locale));
}

async function activity(supabase: Client, formData: FormData, locale: string): Promise<StepState> {
  const current = await workspaceUnlessDone(supabase, formData, locale);
  if (current.error) return { formError: "unknown" };
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
    .upsert({ workspace_id: workspaceId, answers: { trade, ...diagnostic } }, { onConflict: "workspace_id" });
  if (answersError) return { formError: dbErrorKey(answersError) };

  return { status: "saved", savedAt: Date.now(), workspaceId };
}

// Étape 2 « Ton profil et ta marque ». Tout est vérifié (logo compris, d'après son
// contenu) avant la moindre écriture ; puis logo, puis une seule mise à jour du workspace
// (profil + marque), qui pose onboarded_at (base) : l'application est ouverte, même si la
// personne s'arrête là.
export async function saveProfileStep(_prev: StepState, formData: FormData): Promise<StepState> {
  const { supabase, locale } = await signedInClient(formData);
  return classicSubmit(formData, locale, await profileStep(supabase, formData, locale));
}

async function profileStep(supabase: Client, formData: FormData, locale: string): Promise<StepState> {
  const { workspace, error } = await workspaceUnlessDone(supabase, formData, locale);
  if (error) return { formError: "unknown" };
  const parsed = parseWith(profileStepSchema, formValues(formData, PROFILE_STEP_FIELDS));
  const logo = await readLogoUpload(formData.get("logo"));
  if (!parsed.ok || "error" in logo) {
    return {
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...("error" in logo ? { logo: logo.error } : {}) },
      formError: "fix_errors",
    };
  }

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

// Fin du démarrage : étape 3 terminée ou « Plus tard ». Marche sans JavaScript, puis la
// page demandée avant la connexion ou le tableau de bord. « Plus tard » envoie aussi les
// champs de l'étape 3 : NIF, STAT et régime déjà saisis et au bon format sont gardés (un
// champ vide ou mal saisi est laissé de côté, rien n'est effacé). Démarrage déjà terminé
// (page restée en cache) : rien n'est écrit.
export async function finishOnboarding(formData: FormData) {
  const { supabase, locale } = await signedInClient(formData);
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { workspace } = await workspaceUnlessDone(supabase, formData, locale);
  // Profil pas encore enregistré : le démarrage reprend à la bonne étape.
  if (!workspace?.onboarded_at) return redirect({ href: "/demarrage", locale });
  // Carte vérifiée ou en cours : ses numéros ne changent pas d'ici (la base annulerait la
  // vérification) ; Réglages le permet, avec un avertissement.
  if (workspace.fiscal_status !== "verified" && workspace.fiscal_status !== "pending") {
    const shape = optionalFiscalSchema.shape;
    const nif = shape.nif.safeParse(formData.get("nif")).data;
    const stat = shape.stat.safeParse(formData.get("stat")).data;
    const tax_regime = shape.tax_regime.safeParse(formData.get("tax_regime")).data;
    const fiscal = { ...(nif && { nif }), ...(stat && { stat }), ...(tax_regime && { tax_regime }) };
    if (Object.keys(fiscal).length > 0) await supabase.from("workspaces").update(fiscal).eq("id", workspace.id);
  }
  await supabase
    .from("onboarding_answers")
    .update({ completed_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id)
    .is("completed_at", null);
  return redirect({ href: next ?? "/tableau-de-bord", locale });
}
