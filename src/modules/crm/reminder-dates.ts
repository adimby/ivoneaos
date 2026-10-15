import { localMinutesOfDay, startOfLocalDay } from "@/lib/time";

// « Me rappeler » : choix rapides, à 9 h (heure de Madagascar) le jour choisi.
export const QUICK_CHOICES = { tomorrow: 1, in3days: 3, in1week: 7 } as const;
export type QuickChoice = keyof typeof QUICK_CHOICES;
export const DEFAULT_HOUR = 9;

// Repousser : +1 jour, +3 jours, +1 semaine.
export const SNOOZE_DAYS = [1, 3, 7] as const;
export type SnoozeDays = (typeof SNOOZE_DAYS)[number];

const MINUTE_MS = 60 * 1000;

export function quickDueAt(choice: QuickChoice, now: Date): Date {
  return new Date(startOfLocalDay(now, QUICK_CHOICES[choice]).getTime() + DEFAULT_HOUR * 60 * MINUTE_MS);
}

// Rappel repoussé de `days` jours, à la même heure locale que prévu. Repousser recule
// toujours : à partir du jour prévu s'il est à venir, d'aujourd'hui s'il est passé (un
// rappel en retard ne reste pas en retard).
export function snoozeDueAt(dueAt: Date, days: SnoozeDays, now: Date): Date {
  const base = Math.max(startOfLocalDay(dueAt).getTime(), startOfLocalDay(now).getTime());
  return new Date(startOfLocalDay(new Date(base), days).getTime() + localMinutesOfDay(dueAt) * MINUTE_MS);
}

// « Aujourd'hui » : rappels non faits dont l'échéance est avant minuit ce soir (en retard compris).
export function todayCutoff(now: Date): Date {
  return startOfLocalDay(now, 1);
}
