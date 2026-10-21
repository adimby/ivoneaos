import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryList, favouriteCountries, isCountryCode, normalizeSearch, resolveCountry, searchCountries } from "./countries";

describe("COUNTRY_CODES", () => {
  it("249 codes ISO 3166-1 alpha-2, sans doublon, tous nommés", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    for (const code of COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/);
    for (const { code, name } of countryList("fr")) expect(name, code).not.toBe(code);
    expect(isCountryCode("JP")).toBe(true);
    expect(isCountryCode("XK")).toBe(false);
  });
});

describe("contrainte contacts_country_iso", () => {
  it("la base accepte exactement la même liste que l'application", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261021170000_contact_country_iso.sql", import.meta.url), "utf8");
    const list = sql.slice(sql.indexOf("country in ("), sql.indexOf(")) not valid"));
    expect([...list.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1])).toEqual([...COUNTRY_CODES]);
  });
});

describe("countryList", () => {
  it("noms dans la langue de l'interface, triés selon cette langue", () => {
    const fr = countryList("fr");
    expect(fr.find((c) => c.code === "JP")?.name).toBe("Japon");
    expect(countryList("en").find((c) => c.code === "JP")?.name).toBe("Japan");
    const names = fr.map((c) => c.name);
    // « Égypte » rangé avec les E (ordre du français), pas après « Z ».
    expect(names.indexOf("Égypte")).toBeLessThan(names.indexOf("Espagne"));
    expect(names.indexOf("Égypte")).toBeGreaterThan(names.indexOf("Danemark"));
  });
});

describe("normalizeSearch", () => {
  it("ignore accents, casse, espaces et apostrophes typographiques", () => {
    expect(normalizeSearch("  ÉTATS-Unis ")).toBe("etats unis");
    expect(normalizeSearch("Côte d’Ivoire")).toBe("cote d'ivoire");
    expect(normalizeSearch("La Réunion")).toBe("la reunion");
  });
});

describe("searchCountries", () => {
  const fr = countryList("fr");
  const codes = (query: string) => searchCountries(fr, query).map((c) => c.code);

  it("par nom, sans accents ni casse", () => {
    expect(codes("japon")[0]).toBe("JP");
    expect(codes("REUNION")[0]).toBe("RE");
    expect(codes("etats")).toContain("US");
    expect(codes("cote d'iv")[0]).toBe("CI");
  });
  it("par code", () => {
    expect(codes("jp")[0]).toBe("JP");
    expect(codes("MU")[0]).toBe("MU");
  });
  it("début de nom avant début de mot, avant le reste", () => {
    const results = codes("mar");
    // Maroc (début du nom) avant Îles Marshall (début d'un mot), avant Danemark (dans le nom).
    expect(results.indexOf("MA")).toBeGreaterThanOrEqual(0);
    expect(results.indexOf("MA")).toBeLessThan(results.indexOf("MH"));
    expect(results.indexOf("MH")).toBeLessThan(results.indexOf("DK"));
  });
  it("aucun résultat, ou toute la liste si la recherche est vide", () => {
    expect(codes("zzz")).toEqual([]);
    expect(codes("  ")).toHaveLength(249);
  });
});

describe("favouriteCountries", () => {
  it("Madagascar d'abord, puis les pays des contacts du plus fréquent au moins fréquent, complétés par la liste régionale", () => {
    expect(favouriteCountries(["FR", "JP", "MU"])).toEqual(["MG", "FR", "JP", "MU", "RE"]);
    // Un seul client à l'étranger : France, La Réunion et Maurice restent proposés.
    expect(favouriteCountries(["JP"])).toEqual(["MG", "JP", "FR", "RE", "MU"]);
    expect(favouriteCountries(["JP", "CA", "BE"])).toEqual(["MG", "JP", "CA", "BE", "FR", "RE"]);
  });
  it("5 pays au plus, sans Madagascar en double ni code inconnu", () => {
    expect(favouriteCountries(["MG", "FR", "XX", "JP", "MU", "BE", "CA", "DE"])).toEqual(["MG", "FR", "JP", "MU", "BE", "CA"]);
  });
  it("sans contact : Madagascar, France, La Réunion, Maurice", () => {
    expect(favouriteCountries([])).toEqual(["MG", "FR", "RE", "MU"]);
    expect(favouriteCountries(["MG"])).toEqual(["MG", "FR", "RE", "MU"]);
  });
});

describe("resolveCountry", () => {
  const fr = countryList("fr");
  const code = (query: string) => resolveCountry(fr, query)?.code ?? null;

  it("seul résultat, ou nom ou code exact", () => {
    expect(code("japon")).toBe("JP");
    expect(code("JAP")).toBe("JP");
    expect(code("jp")).toBe("JP");
    // « Niger » désigne le Niger, pas le Nigeria ; « reunion » sans accent.
    expect(code("niger")).toBe("NE");
    expect(code("la reunion")).toBe("RE");
    // Noms courants.
    expect(code("usa")).toBe("US");
    expect(code("UK")).toBe("GB");
    expect(code("Angleterre")).toBe("GB");
  });
  it("ambigu ou introuvable : null", () => {
    expect(code("mal")).toBeNull();
    // Code que commencent d'autres noms : ambigu (« ma » : Madagascar, Maroc…).
    expect(code("ma")).toBeNull();
    expect(code("in")).toBeNull();
    expect(code("zzz")).toBeNull();
    expect(code("  ")).toBeNull();
  });
});
