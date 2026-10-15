import type { z } from "zod";

// Erreurs par champ : une clé de traduction (FormErrors.*) par champ, la première trouvée.
export type FieldErrors = Record<string, string>;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors };

// Les valeurs absentes du formulaire deviennent "" : le schéma décide si c'est obligatoire.
export function formValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((key) => {
      const value = formData.get(key);
      return [key, typeof value === "string" ? value : ""];
    }),
  );
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!(field in fieldErrors)) fieldErrors[field] = knownKey(issue.message);
  }
  return { ok: false, fieldErrors };
}

// Les messages des schémas sont des clés ; un message interne de zod devient « required ».
const KEYS = new Set([
  "required",
  "too_long",
  "invalid_number",
  "too_large",
  "invalid_choice",
  "nif_format",
  "stat_format",
  "mvola_format",
  "rib_format",
]);
function knownKey(message: string): string {
  return KEYS.has(message) ? message : "required";
}
