import { z } from "zod";
import { EXPERIENCES } from "./diagnostic-fields";

// Nombre entier saisi librement (« 1 500 000 ») : espaces retirés ; ni signe ni décimales.
const wholeNumber = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "required")
    .transform((value) => value.replace(/[\s\u00a0\u202f]/g, ""))
    .pipe(z.string().regex(/^\d+$/, "invalid_number"))
    .transform(Number)
    .pipe(z.number().max(max, "too_large"));

// Diagnostic (étape 1). Le métier est un champ du profil pro (repris de l'étape 1).
export const diagnosticSchema = z.object({
  experience: z.enum(EXPERIENCES, { error: "invalid_choice" }),
  current_clients: wholeNumber(100_000),
  // Ariary par mois.
  monthly_income_goal: wholeNumber(1_000_000_000_000),
});

export type DiagnosticInput = z.output<typeof diagnosticSchema>;
