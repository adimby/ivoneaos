import { timingSafeEqual } from "node:crypto";

// Comparaison à temps constant (en-tête Authorization des tâches planifiées).
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
