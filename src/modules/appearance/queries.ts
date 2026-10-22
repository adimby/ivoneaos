import "server-only";
import { cache } from "react";
import { getUserId } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { parseAppearance, type Appearance } from "./preference";

// Apparence enregistrée dans le profil de la personne connectée (RLS : sa ligne seulement).
export const getProfileAppearance = cache(async (): Promise<Appearance | null> => {
  const userId = await getUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("theme_mode, theme_palette").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return parseAppearance(`${data.theme_mode}.${data.theme_palette}`);
});
