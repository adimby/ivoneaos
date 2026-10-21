// Pays des contacts : tous les codes ISO 3166-1 alpha-2 (249), nommés dans la langue de
// l'interface par Intl.DisplayNames. Partagé avec le navigateur (recherche du sélecteur).

export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];
export type Country = { code: string; name: string };

const CODES = new Set<string>(COUNTRY_CODES);

export function isCountryCode(value: string): value is CountryCode {
  return CODES.has(value);
}

// Madagascar toujours en tête ; sans contact, les pays voisins et clients fréquents.
export const HOME_COUNTRY = "MG";
const DEFAULT_FAVOURITES = ["FR", "RE", "MU"];
const MAX_TOP = 5;

// Favoris : Madagascar, puis les pays les plus utilisés par les contacts du workspace
// (déjà triés, du plus fréquent au moins fréquent), complétés par la liste régionale
// jusqu'à 5 pays : un premier client au Japon ne fait pas disparaître la France.
export function favouriteCountries(top: readonly string[]): string[] {
  const used = top.filter((code) => code !== HOME_COUNTRY && isCountryCode(code));
  const fill = DEFAULT_FAVOURITES.filter((code) => !used.includes(code));
  return [HOME_COUNTRY, ...[...used, ...fill].slice(0, MAX_TOP)];
}

// Tous les pays, nommés et triés dans la langue de l'interface.
export function countryList(locale: string): Country[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const collator = new Intl.Collator(locale);
  return COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    collator.compare(a.name, b.name),
  );
}

// Texte comparable : sans accents ni casse, apostrophes et tirets unifiés.
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[-‐‑–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Noms courants qui ne sont ni le nom officiel ni le code.
const ALIASES: Record<string, string> = { usa: "US", uk: "GB", angleterre: "GB", england: "GB" };

// Recherche par nom (début de nom, puis début d'un mot, puis n'importe où), par code
// (« jp ») ou par nom courant (« usa »). L'ordre de la liste est gardé à pertinence égale.
export function searchCountries(countries: readonly Country[], query: string): Country[] {
  const q = normalizeSearch(query);
  if (!q) return [...countries];
  const ranked: { country: Country; rank: number }[] = [];
  for (const country of countries) {
    const name = normalizeSearch(country.name);
    let rank = -1;
    if (country.code.toLowerCase() === q || ALIASES[q] === country.code) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.split(/[\s'(),.]+/).some((word) => word.startsWith(q))) rank = 2;
    else if (name.includes(q)) rank = 3;
    if (rank >= 0) ranked.push({ country, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.country);
}

// Saisie non choisie dans la liste : le pays qu'elle désigne sans ambiguïté (seul
// résultat, nom exact, nom courant, ou code que ne commence aucun autre nom), sinon null.
// « ma » reste ambigu (Madagascar, Maroc…) : la personne doit choisir.
export function resolveCountry(countries: readonly Country[], query: string): Country | null {
  const q = normalizeSearch(query);
  if (!q) return null;
  const results = searchCountries(countries, q);
  if (results.length === 1) return results[0];
  const exact = results.find((c) => normalizeSearch(c.name) === q || ALIASES[q] === c.code);
  if (exact) return exact;
  const byCode = results.find((c) => c.code.toLowerCase() === q);
  const otherStartsWith = results.some((c) => c !== byCode && normalizeSearch(c.name).startsWith(q));
  return byCode && !otherStartsWith ? byCode : null;
}
