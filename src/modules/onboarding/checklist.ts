import type { WorkspaceLevel } from "./level";

export type ChecklistKey = "contact" | "papi" | "quote";

export type ChecklistState = {
  hasContact: boolean;
  papiConnected: boolean;
  hasQuote: boolean;
};

export type ChecklistItem = {
  key: ChecklistKey;
  done: boolean;
  href: "/contacts" | "/reglages/paiements" | "/pipeline";
};

const HREF: Record<ChecklistKey, ChecklistItem["href"]> = {
  contact: "/contacts",
  papi: "/reglages/paiements",
  // Le devis naît d'une opportunité (spec P5.1).
  quote: "/pipeline",
};

// Ordre adapté au niveau : qui démarre trouve d'abord un prospect ; qui a déjà des
// clients branche d'abord le paiement pour encaisser plus vite.
const ORDER: Record<"lancer" | "remplir", ChecklistKey[]> = {
  lancer: ["contact", "quote", "papi"],
  remplir: ["papi", "contact", "quote"],
};

export function checklistTextLevel(level: WorkspaceLevel): "lancer" | "remplir" {
  return level === "lancer" ? "lancer" : "remplir";
}

export function startChecklist(level: WorkspaceLevel, state: ChecklistState): ChecklistItem[] {
  const done: Record<ChecklistKey, boolean> = {
    contact: state.hasContact,
    papi: state.papiConnected,
    quote: state.hasQuote,
  };
  return ORDER[checklistTextLevel(level)].map((key) => ({ key, done: done[key], href: HREF[key] }));
}
