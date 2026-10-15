// Constantes du diagnostic partagées avec le navigateur (sans zod).
export const EXPERIENCES = ["lt1", "1to3", "gt3"] as const;
export const DIAGNOSTIC_FIELDS = ["experience", "current_clients", "monthly_income_goal"] as const;

export type DiagnosticDefaults = { experience: string; current_clients: string; monthly_income_goal: string };
export const EMPTY_DIAGNOSTIC: DiagnosticDefaults = { experience: "", current_clients: "", monthly_income_goal: "" };
