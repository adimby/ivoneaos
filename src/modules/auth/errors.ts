export type AuthErrorKey = "invalid_email" | "invalid_code_format" | "code_invalid" | "rate_limited" | "unknown";

// Erreur Supabase Auth → message compréhensible (Auth.errors.*). Un code faux et un code
// expiré renvoient la même erreur (otp_expired) : un seul message pour les deux.
export function authErrorKey(error: { code?: string; status?: number } | null | undefined): AuthErrorKey {
  switch (error?.code) {
    case "otp_expired":
      return "code_invalid";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limited";
    case "email_address_invalid":
    case "validation_failed":
      return "invalid_email";
  }
  if (error?.status === 429) return "rate_limited";
  return "unknown";
}
