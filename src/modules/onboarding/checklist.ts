import type { WorkspaceLevel } from "./level";

export type ChecklistKey = "contact" | "papi" | "quote" | "fiscal";

export type ChecklistState = {
  hasContact: boolean;
  papiConnected: boolean;
  hasQuote: boolean;
  // NIF, STAT et régime fiscal enregistrés (obligatoires pour émettre une facture).
  hasFiscalInfo: boolean;
};

export type ChecklistItem = {
  key: ChecklistKey;
  done: boolean;
  href: "/contacts" | "/reglages/paiements" | "/pipeline" | "/reglages#infos-fiscales";
};

const HREF: Record<ChecklistKey, ChecklistItem["href"]> = {
  contact: "/contacts",
  papi: "/reglages/paiements",
  // Le devis naît d'une opportunité (spec P5.1).
  quote: "/pipeline",
  fiscal: "/reglages#infos-fiscales",
};

// Ordre adapté au niveau : qui démarre trouve d'abord un prospect ; qui a déjà des
// clients branche d'abord le paiement et ses infos fiscales pour facturer plus vite.
const ORDER: Record<"lancer" | "remplir", ChecklistKey[]> = {
  lancer: ["contact", "quote", "fiscal", "papi"],
  remplir: ["papi", "fiscal", "contact", "quote"],
};

export function checklistTextLevel(level: WorkspaceLevel): "lancer" | "remplir" {
  return level === "lancer" ? "lancer" : "remplir";
}

export function startChecklist(level: WorkspaceLevel, state: ChecklistState): ChecklistItem[] {
  const done: Record<ChecklistKey, boolean> = {
    contact: state.hasContact,
    papi: state.papiConnected,
    quote: state.hasQuote,
    fiscal: state.hasFiscalInfo,
  };
  return ORDER[checklistTextLevel(level)].map((key) => ({ key, done: done[key], href: HREF[key] }));
}
