// Heure de Madagascar (Indian/Antananarivo) : UTC+3 toute l'année, sans heure d'été.
// Les dates « du jour » (rappels, échéances) se calculent dans ce fuseau, pas dans celui
// du serveur (UTC sur Vercel) ni du navigateur.
export const TIME_ZONE = "Indian/Antananarivo";
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

// Heure locale représentée par les champs UTC d'une Date décalée (calcul interne).
function shifted(instant: Date): Date {
  return new Date(instant.getTime() + OFFSET_MS);
}

// « 2026-10-15 » : date du jour à Antananarivo.
export function localDate(instant: Date): string {
  const d = shifted(instant);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Minuit à Antananarivo, `addDays` jours après le jour de `instant`.
export function startOfLocalDay(instant: Date, addDays = 0): Date {
  const d = shifted(instant);
  const midnightLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + addDays);
  return new Date(midnightLocal - OFFSET_MS);
}

// Minutes écoulées depuis minuit (heure locale).
export function localMinutesOfDay(instant: Date): number {
  const d = shifted(instant);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// Valeur d'un champ <input type="datetime-local"> : « 2026-10-15T14:30 », heure locale.
export function toLocalInputValue(instant: Date): string {
  const d = shifted(instant);
  return `${localDate(instant)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// Saisie « 2026-10-15T14:30 » (heure de Madagascar) → instant. null si invalide.
export function parseLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS;
  const result = new Date(utc);
  // 2026-02-31 ou 25:00 : refusés (Date.UTC les ferait déborder).
  if (toLocalInputValue(result) !== `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`) return null;
  return result;
}

// Écart en jours calendaires (heure locale) : 0 aujourd'hui, 1 demain, -1 hier.
export function localDayDiff(instant: Date, now: Date): number {
  return Math.round((startOfLocalDay(instant).getTime() - startOfLocalDay(now).getTime()) / DAY_MS);
}
