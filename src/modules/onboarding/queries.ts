import "server-only";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_DIAGNOSTIC, EXPERIENCES, type DiagnosticDefaults } from "./diagnostic-fields";

export type OnboardingAnswers = { diagnostic: DiagnosticDefaults; completedAt: string | null };

// Réponses du diagnostic déjà enregistrées (étape 1 validée, démarrage interrompu) :
// reprises dans le formulaire, au format de saisie (« 1 500 000 »). null : aucune.
export async function getOnboardingAnswers(workspaceId: string): Promise<OnboardingAnswers | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_answers")
    .select("answers, completed_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data ? { diagnostic: diagnosticDefaults(data.answers), completedAt: data.completed_at } : null;
}

export function diagnosticDefaults(answers: unknown): DiagnosticDefaults {
  if (typeof answers !== "object" || answers === null) return EMPTY_DIAGNOSTIC;
  const a = answers as Record<string, unknown>;
  const whole = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
      : "";
  return {
    experience: (EXPERIENCES as readonly unknown[]).includes(a.experience) ? String(a.experience) : "",
    current_clients: whole(a.current_clients),
    monthly_income_goal: whole(a.monthly_income_goal),
  };
}
