import { z } from "zod";
import { CURRENCIES } from "@/lib/money";

// Validation du profil pro (démarrage et Réglages). Les messages sont des clés FormErrors.*.

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

export const profileSchema = z.object({
  name: requiredText(200),
  trade: requiredText(200),
  address: requiredText(500),
  default_currency: z.enum(CURRENCIES, { error: "invalid_choice" }),
  // NIF : 10 chiffres ; STAT : 17 chiffres (carte fiscale).
  nif: digits(10, "nif_format"),
  stat: digits(17, "stat_format"),
  tax_regime: z.enum(["tva", "impot_synthetique"], { error: "invalid_choice" }),
  mvola: optionalMvola,
  rib: optionalRib,
  // Une ligne libre (IBAN et BIC, PayPal, Wise…), espaces et retours à la ligne réduits.
  other: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(300, "too_long")),
});

export type ProfileInput = z.output<typeof profileSchema>;
export const PROFILE_FIELDS = Object.keys(profileSchema.shape) as (keyof ProfileInput)[];
