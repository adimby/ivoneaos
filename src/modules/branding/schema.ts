import { z } from "zod";
import { BRAND_FONTS, isReadablePrimary, LOGO_POSITIONS, LOGO_SIZES, normalizeHex } from "./brand";

// Formulaire Réglages > Image de marque (contrôle serveur ; les messages sont des clés
// FormErrors.*). Les cases à cocher absentes du formulaire arrivent en "".
export const BRANDING_FIELDS = [
  "show_logo",
  "logo_size",
  "logo_position",
  "primary_color",
  "accent_color",
  "font",
  "invoice_footer",
  "remove_banner",
] as const;

const hex = z.string().transform((value, ctx) => {
  const normalized = normalizeHex(value);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "color_format" });
    return z.NEVER;
  }
  return normalized;
});

const checkbox = z.string().transform((value) => value === "on" || value === "1" || value === "true");

export const brandingSchema = z.object({
  show_logo: checkbox,
  logo_size: z.enum(LOGO_SIZES, { message: "invalid_choice" }),
  logo_position: z.enum(LOGO_POSITIONS, { message: "invalid_choice" }),
  primary_color: hex.refine(isReadablePrimary, { message: "primary_contrast" }),
  accent_color: hex,
  font: z.enum(BRAND_FONTS, { message: "invalid_choice" }),
  invoice_footer: z
    .string()
    .trim()
    .max(300, { message: "too_long" })
    .transform((value) => value || null),
  remove_banner: checkbox,
});

export type BrandingInput = z.output<typeof brandingSchema>;
