import { z } from "zod";
import { CURRENCIES, parseAmountInput } from "@/lib/money";
import { parseLocalInput } from "@/lib/time";
import { ACTIVITY_KINDS, CONTACT_KINDS, COUNTRIES } from "./constants";
import { normalizePhone } from "./phone";

// Validation des formulaires CRM. Les messages sont des clés FormErrors.*.


const MAX_TAGS = 10;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "too_long")
    .transform((v) => v || null);

// Étiquettes saisies « client, graphisme » : sans doublon, 10 au plus, 30 caractères chacune.
const tags = z
  .string()
  .transform((value) => [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))])
  .pipe(z.array(z.string().max(30, "too_long")).max(MAX_TAGS, "too_long"));

export const contactSchema = z
  .object({
    name: z.string().trim().min(1, "required").max(200, "too_long"),
    kind: z.enum(CONTACT_KINDS, { error: "invalid_choice" }).catch("person"),
    company_name: optionalText(200),
    phone: z
      .string()
      .trim()
      .max(40, "too_long")
      .transform((value, ctx) => {
        if (value === "") return null;
        const phone = normalizePhone(value);
        if (!phone) ctx.addIssue({ code: "custom", message: "phone_format" });
        return phone;
      }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(320, "too_long")
      .pipe(z.union([z.literal(""), z.email("email_format")]))
      .transform((v) => v || null),
    country: z.enum(COUNTRIES, { error: "invalid_choice" }).catch("MG"),
    tags,
  })
  // Un contact se joint : téléphone ou e-mail (aussi vérifié par la base).
  .superRefine((value, ctx) => {
    if (!value.phone && !value.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "reachable_required" });
  });

export type ContactInput = z.output<typeof contactSchema>;
export const CONTACT_FIELDS = ["name", "kind", "company_name", "phone", "email", "country", "tags"] as const;

export const dealSchema = z
  .object({
    title: z.string().trim().min(1, "required").max(200, "too_long"),
    contact_id: z.uuid("required"),
    // Création seulement (étape ouverte, vérifiée par l'action) ; vide : première étape.
    stage_id: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.uuid("invalid_choice")]))
      .transform((v) => v || null),
    currency: z.enum(CURRENCIES, { error: "invalid_choice" }),
    amount: z.string().trim(),
    expected_close_on: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.iso.date("date_format")]))
      .transform((v) => v || null),
  })
  .transform((value, ctx) => {
    if (value.amount === "") return { ...value, amount: null };
    const parsed = parseAmountInput(value.amount, value.currency);
    if (!parsed.ok) {
      // Message d'exemple valable pour toutes les devises (« 1 250,50 » en euros).
      const message = parsed.error === "invalid_number" ? "amount_format" : parsed.error;
      ctx.addIssue({ code: "custom", path: ["amount"], message });
      return z.NEVER;
    }
    return { ...value, amount: parsed.minor };
  });

export type DealInput = z.output<typeof dealSchema>;
export const DEAL_FIELDS = ["title", "contact_id", "stage_id", "currency", "amount", "expected_close_on"] as const;

// Date et heure saisies en heure de Madagascar (champ datetime-local).
const localDateTime = z
  .string()
  .transform((value, ctx) => {
    const date = parseLocalInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message: value.trim() ? "date_format" : "required" });
      return z.NEVER;
    }
    return date;
  });

export const activitySchema = z.object({
  kind: z.enum(ACTIVITY_KINDS, { error: "invalid_choice" }),
  body: z.string().trim().min(1, "required").max(10_000, "too_long"),
  occurred_at: localDateTime,
});
export const ACTIVITY_FIELDS = ["kind", "body", "occurred_at"] as const;

export const reminderSchema = z.object({
  title: z.string().trim().min(1, "required").max(200, "too_long"),
  due_at: localDateTime,
});

