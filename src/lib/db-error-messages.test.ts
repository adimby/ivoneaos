import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

// Chaque message-clé levé par la base (raise exception '<clé>') doit être traduit,
// pour qu'aucune erreur brute n'atteigne la freelance.
const migrationsDir = join(process.cwd(), "supabase/migrations");
const raisedKeys = new Set(
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .flatMap((f) =>
      [...readFileSync(join(migrationsDir, f), "utf8").matchAll(/raise exception '([a-z_]+)'/g)].map(
        (m) => m[1],
      ),
    ),
);

describe("messages d'erreur de la base", () => {
  it("trouve les clés dans les migrations", () => {
    expect(raisedKeys.size).toBeGreaterThan(10);
  });

  it.each([...raisedKeys])("%s est traduit en français et en anglais", (key) => {
    expect(fr.errors.db).toHaveProperty(key);
    expect(en.errors.db).toHaveProperty(key);
  });

  it("fr et en ont les mêmes clés", () => {
    expect(Object.keys(en.errors.db).sort()).toEqual(Object.keys(fr.errors.db).sort());
    expect(Object.keys(en.pipeline.stages).sort()).toEqual(Object.keys(fr.pipeline.stages).sort());
  });

  it("traduit les 6 étapes créées par create_workspace", () => {
    expect(Object.keys(fr.pipeline.stages).sort()).toEqual(
      ["call", "contacted", "lost", "prospect", "quote", "won"],
    );
  });
});
