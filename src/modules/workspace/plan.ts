// Offres (docs/spec-mvp.md, « Offres et limites ») : une seule table de constantes.
// La base applique les mêmes limites (contacts_plan_limit, next_document_number) et reste
// juge ; canUse permet de prévenir avant l'action et d'afficher l'usage.
// Le plan se change à la main par Ivonea (rôle serveur), jamais par l'utilisatrice.

export const PLANS = ["decouverte", "lancement", "premier_client", "contrat_signe"] as const;
export type Plan = (typeof PLANS)[number];

// null : illimité.
export const PLAN_LIMITS: Record<Plan, { activeContacts: number | null; documentsPerMonth: number | null }> = {
  decouverte: { activeContacts: 20, documentsPerMonth: 3 },
  lancement: { activeContacts: null, documentsPerMonth: null },
  premier_client: { activeContacts: null, documentsPerMonth: null },
  contrat_signe: { activeContacts: null, documentsPerMonth: null },
};

// Prix mensuel en ariary, quand la grille en fixe un (Découverte : gratuit).
export const PLAN_MONTHLY_PRICE_MGA: Partial<Record<Plan, number>> = { decouverte: 0, lancement: 50_000 };

// create_contact : un contact actif de plus ; send_document : un devis ou une facture qui
// quitte le brouillon ce mois-ci (calendaire, heure d'Antananarivo).
export type Feature = "create_contact" | "send_document";
export type PlanUsage = { activeContacts: number; documentsThisMonth: number };

export function canUse(workspace: { plan: Plan }, feature: Feature, usage: PlanUsage): boolean {
  const limits = PLAN_LIMITS[workspace.plan];
  if (feature === "create_contact") return limits.activeContacts === null || usage.activeContacts < limits.activeContacts;
  return limits.documentsPerMonth === null || usage.documentsThisMonth < limits.documentsPerMonth;
}

// Lignes d'usage affichées (« Contacts actifs 12/20 ») ; limit null = illimité.
export function planMeters(plan: Plan, usage: PlanUsage) {
  const limits = PLAN_LIMITS[plan];
  return [
    { key: "contacts" as const, used: usage.activeContacts, limit: limits.activeContacts },
    { key: "documents" as const, used: usage.documentsThisMonth, limit: limits.documentsPerMonth },
  ].map((m) => ({ ...m, reached: m.limit !== null && m.used >= m.limit }));
}
