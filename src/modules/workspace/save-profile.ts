import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorKey, type DbErrorKey } from "@/lib/db-errors";
import type { Database } from "@/lib/supabase/database.types";
import { logoPath, type CheckedLogo } from "./logo";
import { composeManualInstructions } from "./manual-instructions";
import type { FiscalInput, OnboardingProfileInput, ProfileInput } from "./profile-schema";

type Client = SupabaseClient<Database>;
type Level = Database["public"]["Enums"]["workspace_level"];

// Profil pro + coordonnées de paiement direct. Client de l'utilisatrice : RLS appliquée.
// La mise à jour du workspace vient en dernier : c'est elle qui termine l'accueil guidé
// (onboarded_at, posé par la base) ; un échec avant elle laisse l'accueil guidé ouvert.
// Données fiscales : écrites seulement si le profil les contient (Réglages), jamais
// effacées par l'accueil guidé qui ne les demande pas.
export async function saveProfile(
  supabase: Client,
  workspaceId: string,
  profile: OnboardingProfileInput | ProfileInput,
  extra: { level?: Level; logoPath?: string } = {},
): Promise<DbErrorKey | null> {
  const manualError = await saveManualInstructions(supabase, workspaceId, composeManualInstructions(profile));
  if (manualError) return manualError;

  const { error } = await supabase
    .from("workspaces")
    .update({
      name: profile.name,
      trade: profile.trade,
      address: profile.address,
      default_currency: profile.default_currency,
      ...("nif" in profile && { nif: profile.nif, stat: profile.stat, tax_regime: profile.tax_regime }),
      ...(extra.level && { level: extra.level }),
      ...(extra.logoPath && { logo_path: extra.logoPath }),
    })
    .eq("id", workspaceId);
  return error ? dbErrorKey(error) : null;
}

// NIF, STAT et régime fiscal (bloc « Avant ta première facture »).
export async function saveFiscalInfo(supabase: Client, workspaceId: string, fiscal: FiscalInput): Promise<DbErrorKey | null> {
  const { error } = await supabase.from("workspaces").update(fiscal).eq("id", workspaceId);
  return error ? dbErrorKey(error) : null;
}

async function saveManualInstructions(
  supabase: Client,
  workspaceId: string,
  instructions: string | null,
): Promise<DbErrorKey | null> {
  const { data: existing, error: readError } = await supabase
    .from("payment_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "manual")
    .maybeSingle();
  if (readError) return dbErrorKey(readError);

  let error;
  if (existing && instructions === null) {
    ({ error } = await supabase.from("payment_accounts").delete().eq("id", existing.id));
  } else if (existing) {
    ({ error } = await supabase
      .from("payment_accounts")
      .update({ manual_instructions: instructions })
      .eq("id", existing.id));
  } else if (instructions !== null) {
    ({ error } = await supabase
      .from("payment_accounts")
      .insert({ workspace_id: workspaceId, provider: "manual", manual_instructions: instructions }));
  }
  return error ? dbErrorKey(error) : null;
}

// Nouveau fichier à chaque envoi (bucket en ajout seul), au contenu déjà vérifié
// (readLogoUpload). Le chemin est enregistré ensuite avec le profil (saveProfile).
export async function uploadLogo(supabase: Client, workspaceId: string, logo: CheckedLogo): Promise<string | null> {
  const version = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const path = logoPath(workspaceId, logo.type, version);
  const { error } = await supabase.storage
    .from("logos")
    .upload(path, logo.bytes, { contentType: logo.type, upsert: false, cacheControl: "31536000" });
  return error ? null : path;
}

// Ancien logo (ou envoi devenu inutile) : supprimé s'il ne figure sur aucun document
// émis ; la base refuse sinon, et le fichier reste. Sans effet sur le résultat.
export async function removeLogo(supabase: Client, path: string | null | undefined) {
  if (path) await supabase.storage.from("logos").remove([path]);
}
