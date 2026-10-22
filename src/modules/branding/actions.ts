"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { dbErrorKey } from "@/lib/db-errors";
import { formValues, parseWith, type FieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { bannerPath, readBannerUpload } from "./banner";
import { BRANDING_FIELDS, brandingSchema } from "./schema";

export type BrandingFormState = {
  status?: "saved";
  // Change à chaque enregistrement réussi : le champ bannière est alors vidé.
  savedAt?: number;
  fieldErrors?: FieldErrors;
  formError?: string;
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

// Réglages > Image de marque. Tout est vérifié (bannière comprise, d'après son contenu)
// avant la moindre écriture. Client de l'utilisatrice : RLS et droits par colonne.
export async function saveBranding(_prev: BrandingFormState, formData: FormData): Promise<BrandingFormState> {
  const locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: "/connexion?next=/reglages/image-de-marque", locale });

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("id, brand_banner_path")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return { formError: "unknown" };
  if (!workspace) return redirect({ href: "/demarrage", locale });

  const parsed = parseWith(brandingSchema, formValues(formData, BRANDING_FIELDS));
  const upload = await readBannerUpload(formData.get("banner"));
  if (!parsed.ok || "error" in upload) {
    return {
      fieldErrors: { ...(parsed.ok ? {} : parsed.fieldErrors), ...("error" in upload ? { banner: upload.error } : {}) },
      formError: "fix_errors",
    };
  }

  // Nouveau fichier à chaque envoi (bucket en ajout seul) : la copie figée d'un document
  // émis garde l'ancienne bannière.
  let newBanner: string | null = null;
  if (upload.banner) {
    const version = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    newBanner = bannerPath(workspace.id, upload.banner.type, version);
    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(newBanner, upload.banner.bytes, { contentType: upload.banner.type, upsert: false, cacheControl: "31536000" });
    if (uploadError) return { fieldErrors: { banner: "banner_upload" }, formError: "fix_errors" };
  }

  const data = parsed.data;
  const banner = newBanner ?? (data.remove_banner ? null : workspace.brand_banner_path);
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      brand_show_logo: data.show_logo,
      brand_logo_size: data.logo_size,
      brand_logo_position: data.logo_position,
      brand_primary_color: data.primary_color,
      brand_accent_color: data.accent_color,
      brand_font: data.font,
      brand_banner_path: banner,
      invoice_footer: data.invoice_footer,
    })
    .eq("id", workspace.id);
  if (updateError) {
    if (newBanner) await supabase.storage.from("logos").remove([newBanner]);
    return { formError: dbErrorKey(updateError) };
  }
  // Ancienne bannière remplacée ou retirée : supprimée si aucun document émis ne l'affiche
  // (la base refuse sinon, le fichier reste). Sans effet sur le résultat.
  if (workspace.brand_banner_path && workspace.brand_banner_path !== banner) {
    await supabase.storage.from("logos").remove([workspace.brand_banner_path]);
  }

  refresh();
  return { status: "saved", savedAt: Date.now() };
}
