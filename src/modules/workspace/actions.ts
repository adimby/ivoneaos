"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { formValues, parseWith, type FieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { readLogoUpload } from "./logo";
import { FISCAL_FIELDS, fiscalSchema, PROFILE_FIELDS, settingsProfileSchema } from "./profile-schema";
import { removeLogo, saveFiscalInfo, saveProfile, uploadLogo } from "./save-profile";
import { safeNextPath } from "@/modules/auth/next-path";
import { discardFiscalFiles } from "@/modules/verification/files";

export type ProfileFormState = {
  status?: "saved";
  // Change à chaque enregistrement réussi : le champ logo est alors vidé (pas de renvoi).
  savedAt?: number;
  fieldErrors?: FieldErrors;
  // Clé errors.db.* (erreur de la base) ou FormErrors.fix_errors.
  formError?: string;
  // NIF ou STAT changé alors que la carte était vérifiée ou en cours de vérification : la
  // base a annulé la vérification (la freelance doit redéposer ses photos).
  fiscalReset?: boolean;
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

// Réglages : modification du profil pro (mêmes règles que l'accueil guidé).
export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: "/connexion?next=/reglages", locale });

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, logo_path, nif, stat, tax_regime, fiscal_status")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return { formError: "unknown" };
  if (!workspace) return redirect({ href: "/demarrage", locale });

  // Tout est vérifié (logo compris, d'après son contenu) avant la moindre écriture.
  // Données fiscales déjà complètes : obligatoires (corrigeables, pas effaçables).
  const parsed = parseWith(settingsProfileSchema(workspace), formValues(formData, PROFILE_FIELDS));
  const logo = await readLogoUpload(formData.get("logo"));
  if (!parsed.ok || "error" in logo) {
    return {
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...("error" in logo ? { logo: logo.error } : {}) },
      formError: "fix_errors",
    };
  }

  const logoPath = logo.logo ? await uploadLogo(supabase, workspace.id, logo.logo) : undefined;
  if (logoPath === null) return { fieldErrors: { logo: "logo_upload" }, formError: "fix_errors" };

  const dbError = await saveProfile(supabase, workspace.id, parsed.data, { logoPath });
  if (dbError) {
    await removeLogo(supabase, logoPath);
    return { formError: dbError };
  }
  if (logoPath) await removeLogo(supabase, workspace.logo_path);
  discardCancelledFiscalFiles(workspace, parsed.data);

  refresh();
  return { status: "saved", savedAt: Date.now(), fiscalReset: fiscalReset(workspace, parsed.data) };
}

// « Avant ta première facture » : NIF, STAT et régime fiscal enregistrés depuis la page
// de la facture ou du devis. La page se met à jour (refresh) : le brouillon reste tel quel
// et l'envoi devient possible.
export async function saveFiscal(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const back = safeNextPath(String(formData.get("back") ?? ""));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return redirect({ href: back ? `/connexion?next=${encodeURIComponent(back)}` : "/connexion", locale });
  }

  const parsed = parseWith(fiscalSchema, formValues(formData, FISCAL_FIELDS));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, nif, stat, fiscal_status")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return { formError: "unknown" };
  if (!workspace) return redirect({ href: "/demarrage", locale });

  const dbError = await saveFiscalInfo(supabase, workspace.id, parsed.data);
  if (dbError) return { formError: dbError };
  discardCancelledFiscalFiles(workspace, parsed.data);
  refresh();
  return { status: "saved", savedAt: Date.now(), fiscalReset: fiscalReset(workspace, parsed.data) };
}

// Vérification annulée par cet enregistrement (déclencheur t15_fiscal_guard) : la carte
// était vérifiée ou en cours, et le NIF ou le STAT a changé.
function fiscalReset(
  before: { nif: string | null; stat: string | null; fiscal_status: string },
  next: { nif: string | null; stat: string | null },
): boolean {
  return (before.fiscal_status === "verified" || before.fiscal_status === "pending") && (before.nif !== next.nif || before.stat !== next.stat);
}

// NIF ou STAT changé pendant une vérification en cours : la base annule la demande (retour
// à « non vérifiée ») ; ses photos sont supprimées après la réponse.
function discardCancelledFiscalFiles(
  before: { id: string; nif: string | null; stat: string | null; fiscal_status: string },
  next: { nif: string | null; stat: string | null },
) {
  if (before.fiscal_status === "pending" && (before.nif !== next.nif || before.stat !== next.stat)) {
    after(() => discardFiscalFiles(before.id));
  }
}
