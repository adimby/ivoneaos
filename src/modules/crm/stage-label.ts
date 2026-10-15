import { isStageKey } from "./stages";

// Nom affiché d'une étape : traduction des 6 étapes d'origine, nom libre sinon.
export function stageLabel(t: (key: `pipeline.stages.${string}`) => string, name: string): string {
  return isStageKey(name) ? t(`pipeline.stages.${name}`) : name;
}
