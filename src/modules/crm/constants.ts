// Constantes du CRM partagées avec le navigateur (sans zod).
export const CONTACT_KINDS = ["person", "company"] as const;
// Pays proposés (Madagascar d'abord, puis l'océan Indien et les clients fréquents).
export const COUNTRIES = ["MG", "FR", "RE", "MU", "KM", "YT", "SC", "BE", "CH", "CA", "US", "GB", "DE", "ZA", "CN"] as const;
export const ACTIVITY_KINDS = ["note", "call", "whatsapp", "email", "meeting"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// Pays proposés, nommés dans la langue de l'interface.
export function countryOptions(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code }));
}
