// Étapes du pipeline (6, créées avec le workspace) : prospect, contacted, call, quote
// (kind open), won, lost. Le nom est une clé traduite (pipeline.stages.*) ou un nom libre.
export type StageKind = "open" | "won" | "lost";
export type Stage = { id: string; name: string; position: number; kind: StageKind };

export const STAGE_KEYS = ["prospect", "contacted", "call", "quote", "won", "lost"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export function isStageKey(name: string): name is StageKey {
  return (STAGE_KEYS as readonly string[]).includes(name);
}

// Ordre d'affichage : les étapes ouvertes par position, puis gagné, puis perdu.
export function sortStages<S extends Stage>(stages: S[]): S[] {
  const rank = (s: Stage) => (s.kind === "open" ? 0 : s.kind === "won" ? 1 : 2);
  return [...stages].sort((a, b) => rank(a) - rank(b) || a.position - b.position);
}

// « Étape suivante » : l'étape ouverte suivante, puis « gagné » après la dernière.
// Aucune depuis gagné ou perdu (le choix d'une étape reste possible).
export function nextStage<S extends Stage>(stages: S[], currentId: string): S | null {
  const current = stages.find((s) => s.id === currentId);
  if (!current || current.kind !== "open") return null;
  const open = sortStages(stages).filter((s) => s.kind === "open");
  const index = open.findIndex((s) => s.id === currentId);
  return open[index + 1] ?? stages.find((s) => s.kind === "won") ?? null;
}

// Passer à « gagné » ou « perdu » se confirme (l'opportunité sort du pipeline ouvert).
export function needsConfirmation(stage: Pick<Stage, "kind">): boolean {
  return stage.kind !== "open";
}
