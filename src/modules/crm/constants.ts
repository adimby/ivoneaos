// Constantes du CRM partagées avec le navigateur (sans zod).
export const CONTACT_KINDS = ["person", "company"] as const;
export const ACTIVITY_KINDS = ["note", "call", "whatsapp", "email", "meeting"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

