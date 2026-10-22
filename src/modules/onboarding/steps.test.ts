import { describe, expect, it } from "vitest";
import { resumeStep } from "./steps";

const NOW = "2026-10-22T08:00:00Z";

describe("reprise du démarrage", () => {
  it("commence à l'activité sans workspace ni réponses", () => {
    expect(resumeStep(null, null)).toBe(1);
    // Workspace d'un essai interrompu sans diagnostic enregistré.
    expect(resumeStep({ onboarded_at: null }, null)).toBe(1);
  });
  it("reprend au profil une fois l'activité enregistrée", () => {
    expect(resumeStep({ onboarded_at: null }, { completedAt: null })).toBe(2);
  });
  it("reprend à l'administratif une fois le profil enregistré", () => {
    expect(resumeStep({ onboarded_at: NOW }, { completedAt: null })).toBe(3);
  });
  it("termine quand l'administratif est fait ou remis à plus tard", () => {
    expect(resumeStep({ onboarded_at: NOW }, { completedAt: NOW })).toBe("done");
    // Compte accueilli avant les réponses enregistrées.
    expect(resumeStep({ onboarded_at: NOW }, null)).toBe("done");
  });
});
