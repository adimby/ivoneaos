"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { rememberAppearance } from "./cookie";
import { PALETTES, THEME_MODES } from "./themes";

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const appearanceSchema = z.object({ mode: z.enum(THEME_MODES), palette: z.enum(PALETTES) });

// Réglages > Apparence : profil (suit la personne sur ses appareils) puis cookie de cet
// appareil (affichage sans éclair). Fonctionne sans JavaScript (envoi natif, redirection).
export async function saveAppearance(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const parsed = appearanceSchema.safeParse({ mode: formData.get("mode"), palette: formData.get("palette") });
  if (!parsed.success) return redirect({ href: "/reglages/apparence?r=erreur", locale });

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return redirect({ href: "/connexion?next=/reglages/apparence", locale });

  const { error } = await supabase
    .from("profiles")
    .update({ theme_mode: parsed.data.mode, theme_palette: parsed.data.palette })
    .eq("user_id", claims.claims.sub);
  if (error) return redirect({ href: "/reglages/apparence?r=erreur", locale });

  await rememberAppearance(parsed.data);
  redirect({ href: "/reglages/apparence?r=ok", locale });
}
