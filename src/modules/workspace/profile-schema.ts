import { z } from "zod";
import { CURRENCIES } from "@/lib/money";

// Validation du profil pro (démarrage, Réglages) et des données fiscales (avant la
// première facture). Les messages sont des clés FormErrors.*.

// Espaces, points et tirets tolérés à la saisie, retirés avant contrôle et enregistrement.
export function stripSeparators(value: string): string {
  return value.replace(/[\s.\-  ]/g, "");
}

const requiredText = (max: number) => z.string().trim().min(1, "required").max(max, "too_long");

const digits = (length: number, message: string) =>
  z
    .string()
    .trim()
    .min(1, "required")
    .transform(stripSeparators)
    .pipe(z.string().regex(new RegExp(`^\\d{${length}}$`), message));

// MVola (Telma) : 034 ou 038 + 7 chiffres ; +261 / 261 accepté, ramené au format national.
export function normalizeMvola(value: string): string {
  const compact = stripSeparators(value).replace(/^\+/, "");
  return compact.startsWith("261") ? `0${compact.slice(3)}` : compact;
}

const optionalMvola = z
  .string()
  .trim()
  .transform(normalizeMvola)
  .pipe(z.union([z.literal(""), z.string().regex(/^03[48]\d{7}$/, "mvola_format")]));

const optionalRib = z
  .string()
  .trim()
  .transform(stripSeparators)
  .pipe(z.union([z.literal(""), z.string().regex(/^\d{23}$/, "rib_format")]));

// NIF : 10 chiffres ; STAT : 17 chiffres (carte fiscale). Obligatoires avant la première
// facture (la base refuse sinon), pas à l'accueil guidé.
const NIF = /^\d{10}$/;
const STAT = /^\d{17}$/;
const TAX_REGIMES = ["tva", "impot_synthetique"] as const;

export const fiscalSchema = z.object({
  nif: digits(10, "nif_format"),
  stat: digits(17, "stat_format"),
  tax_regime: z.enum(TAX_REGIMES, { error: "invalid_choice" }),
});

// Réglages : chaque donnée fiscale est facultative (vide = null), mais au bon format.
// Aussi « Plus tard » au démarrage (chaque champ à part).
export const optionalFiscalSchema = z.object({
  nif: z
    .string()
    .trim()
    .transform(stripSeparators)
    .pipe(z.union([z.literal(""), z.string().regex(NIF, "nif_format")]))
    .transform((v) => v || null),
  stat: z
    .string()
    .trim()
    .transform(stripSeparators)
    .pipe(z.union([z.literal(""), z.string().regex(STAT, "stat_format")]))
    .transform((v) => v || null),
  tax_regime: z.enum(["", ...TAX_REGIMES], { error: "invalid_choice" }).transform((v) => v || null),
});

// Accueil guidé : profil pro sans données fiscales (demandées avant la première facture).
export const onboardingProfileSchema = z.object({
  name: requiredText(200),
  trade: requiredText(200),
  address: requiredText(500),
  default_currency: z.enum(CURRENCIES, { error: "invalid_choice" }),
  mvola: optionalMvola,
  rib: optionalRib,
  // Une ligne libre (IBAN et BIC, PayPal, Wise…), espaces et retours à la ligne réduits.
  other: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(300, "too_long")),
});

// Réglages : le même profil, avec les données fiscales facultatives.
export const profileSchema = onboardingProfileSchema.extend(optionalFiscalSchema.shape);
// Réglages une fois les données fiscales complètes : corrigeables, plus effaçables (la
// facture suivante serait sinon bloquée de nouveau).
export const profileWithFiscalSchema = onboardingProfileSchema.extend(fiscalSchema.shape);

export type OnboardingProfileInput = z.output<typeof onboardingProfileSchema>;
export type ProfileInput = z.output<typeof profileSchema>;
export type FiscalInput = z.output<typeof fiscalSchema>;
export const ONBOARDING_PROFILE_FIELDS = Object.keys(onboardingProfileSchema.shape) as (keyof OnboardingProfileInput)[];
export const PROFILE_FIELDS = Object.keys(profileSchema.shape) as (keyof ProfileInput)[];
export const FISCAL_FIELDS = Object.keys(fiscalSchema.shape) as (keyof FiscalInput)[];

// Données fiscales complètes : condition pour émettre une facture (même règle que la base).
export function hasFiscalInfo(workspace: { nif: string | null; stat: string | null; tax_regime: string | null }): boolean {
  return Boolean(workspace.nif?.trim() && workspace.stat?.trim() && workspace.tax_regime);
}

// Schéma des Réglages selon les données fiscales déjà enregistrées.
export function settingsProfileSchema(workspace: { nif: string | null; stat: string | null; tax_regime: string | null }) {
  return hasFiscalInfo(workspace) ? profileWithFiscalSchema : profileSchema;
}

// Valeurs de départ du formulaire fiscal (champs vides si absents).
export function fiscalDefaults(workspace: { nif: string | null; stat: string | null; tax_regime: string | null }) {
  return { nif: workspace.nif ?? "", stat: workspace.stat ?? "", tax_regime: workspace.tax_regime ?? "" };
}
