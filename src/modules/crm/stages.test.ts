import { describe, expect, it } from "vitest";
import { isStageKey, needsConfirmation, nextStage, sortStages, type Stage } from "./stages";

const stages: Stage[] = [
  { id: "lost", name: "lost", position: 5, kind: "lost" },
  { id: "call", name: "call", position: 2, kind: "open" },
  { id: "prospect", name: "prospect", position: 0, kind: "open" },
  { id: "won", name: "won", position: 4, kind: "won" },
  { id: "quote", name: "quote", position: 3, kind: "open" },
  { id: "contacted", name: "contacted", position: 1, kind: "open" },
];

describe("étapes", () => {
  it("ordre : ouvertes par position, gagné, perdu", () => {
    expect(sortStages(stages).map((s) => s.id)).toEqual(["prospect", "contacted", "call", "quote", "won", "lost"]);
  });

  it("étape suivante", () => {
    expect(nextStage(stages, "prospect")?.id).toBe("contacted");
    expect(nextStage(stages, "contacted")?.id).toBe("call");
    expect(nextStage(stages, "call")?.id).toBe("quote");
    expect(nextStage(stages, "quote")?.id).toBe("won");
    expect(nextStage(stages, "won")).toBeNull();
    expect(nextStage(stages, "lost")).toBeNull();
    expect(nextStage(stages, "inconnue")).toBeNull();
  });

  it("étape ouverte ajoutée après « devis » : suivie avant gagné", () => {
    const extra: Stage = { id: "nego", name: "Négociation", position: 6, kind: "open" };
    expect(nextStage([...stages, extra], "quote")?.id).toBe("nego");
    expect(nextStage([...stages, extra], "nego")?.id).toBe("won");
  });

  it("gagné et perdu demandent confirmation", () => {
    expect(needsConfirmation({ kind: "won" })).toBe(true);
    expect(needsConfirmation({ kind: "lost" })).toBe(true);
    expect(needsConfirmation({ kind: "open" })).toBe(false);
  });

  it("clé traduite ou nom libre", () => {
    expect(isStageKey("call")).toBe(true);
    expect(isStageKey("Négociation")).toBe(false);
  });
});
