"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { rememberLocale } from "@/lib/locale-cookie";
import { createClient } from "@/lib/supabase/server";
import { authErrorKey, type AuthErrorKey } from "./errors";
import { safeNextPath } from "./next-path";
import { takeAuthAttempt } from "./rate-limit";

export type LoginState = {
  step: "email" | "code";
  email: string;
  error?: AuthErrorKey;
  notice?: "resent";
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const emailSchema = z.email().max(320);

// Connexion par code reçu par e-mail (OTP Supabase, sans lien magique). Sa longueur se
// règle dans Supabase (6 à 10 chiffres) : l'app les accepte toutes.
// intent : send (envoyer le code), resend, verify, change (revenir à l'e-mail).
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = formData.get("intent");
  const locale = localeSchema.parse(formData.get("locale"));
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();

  if (intent === "change") return { step: "email", email: rawEmail };

  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return { step: "email", email: rawEmail, error: "invalid_email" };

  const supabase = await createClient();

  if (intent !== "verify") {
    const attempt = await takeAuthAttempt("send", email.data);
    if (!attempt.allowed) {
      return { step: intent === "resend" ? "code" : "email", email: email.data, error: "too_many_attempts" };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.data,
      // data : langue du profil créé à l'inscription (handle_new_user).
      options: { shouldCreateUser: true, data: { locale } },
    });
    if (error) {
      // Aucun code envoyé (délai entre deux envois, limite Supabase) : l'essai ne compte pas
      // contre l'adresse.
      await attempt.release();
      return { step: intent === "resend" ? "code" : "email", email: email.data, error: authErrorKey(error) };
    }
    return { step: "code", email: email.data, notice: intent === "resend" ? "resent" : undefined };
  }

  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email: email.data, error: "invalid_code_format" };
  if (!(await takeAuthAttempt("verify", email.data)).allowed) {
    return { step: "code", email: email.data, error: "too_many_attempts" };
  }

  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token, type: "email" });
  if (error || !data.user) return { step: "code", email: email.data, error: authErrorKey(error) };

  // Langue : celle du profil, sauf si la personne vient d'en choisir une sur la page de
  // connexion (lien de langue, champ locale_chosen). Nouveau compte : le profil a été
  // créé dans la langue de la page (handle_new_user).
  let appLocale = locale;
  if (formData.get("locale_chosen") === "1") {
    await supabase.from("profiles").update({ locale }).eq("user_id", data.user.id);
  } else {
    const { data: profile } = await supabase.from("profiles").select("locale").eq("user_id", data.user.id).maybeSingle();
    appLocale = localeSchema.parse(profile?.locale ?? locale);
  }
  await rememberLocale(appLocale);

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("profile_completed_at")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  if (workspace?.profile_completed_at) return redirect({ href: next ?? "/tableau-de-bord", locale: appLocale });
  // Accueil guidé d'abord, puis retour à la page demandée.
  return redirect({
    href: next ? `/demarrage?next=${encodeURIComponent(next)}` : "/demarrage",
    locale: appLocale,
  });
}

export async function signOut(formData: FormData) {
  const locale = localeSchema.parse(formData.get("locale"));
  const supabase = await createClient();
  // Cet appareil seulement : les sessions des autres appareils restent ouvertes.
  await supabase.auth.signOut({ scope: "local" });
  redirect({ href: "/connexion", locale });
}

// Langue de l'application (Réglages, accueil guidé), enregistrée dans le profil et le
// cookie NEXT_LOCALE. back : page où revenir (chemin interne, sans la langue).
export async function setLanguage(formData: FormData) {
  const current = localeSchema.parse(formData.get("current"));
  const parsed = z.enum(routing.locales).safeParse(formData.get("locale"));
  if (!parsed.success) return;
  const locale = parsed.data;
  const back = safeNextPath(String(formData.get("back") ?? "")) ?? "/reglages";

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) return redirect({ href: "/connexion", locale: current });

  await supabase.from("profiles").update({ locale }).eq("user_id", data.claims.sub);
  await rememberLocale(locale);
  redirect({ href: back, locale });
}
