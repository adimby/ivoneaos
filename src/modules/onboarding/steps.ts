// Démarrage en 3 étapes (spec P1) : 1. Ton activité (diagnostic), 2. Ton profil et ta
// marque (pose onboarded_at et ouvre l'application), 3. Administratif (facultatif : « Plus
// tard »). onboarding_answers.completed_at marque la fin du démarrage (étape 3 terminée ou
// remise à plus tard).
export const ONBOARDING_STEPS = [1, 2, 3] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Étape où reprendre après un rechargement ou une nouvelle connexion ; "done" : démarrage
// terminé, direction l'application. Un workspace accueilli sans réponses enregistrées
// (comptes plus anciens) est considéré comme terminé.
export function resumeStep(
  workspace: { onboarded_at: string | null } | null,
  answers: { completedAt: string | null } | null,
): OnboardingStep | "done" {
  if (workspace?.onboarded_at) return answers && !answers.completedAt ? 3 : "done";
  if (!workspace || !answers) return 1;
  return 2;
}
