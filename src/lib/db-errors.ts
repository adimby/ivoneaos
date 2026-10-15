import fr from "../../messages/fr.json";

export type DbErrorKey = keyof typeof fr.errors.db;

const KNOWN = new Set(Object.keys(fr.errors.db));

// Erreur métier de la base (code 55000 + message-clé, cf. migrations) → clé errors.db.*.
export function dbErrorKey(error: { code?: string; message?: string } | null | undefined): DbErrorKey {
  if (error?.message && KNOWN.has(error.message)) return error.message as DbErrorKey;
  return "unknown";
}
