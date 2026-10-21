import { describe, expect, it } from "vitest";
import { parseWith } from "@/lib/forms";
import { fiscalSchema, hasFiscalInfo, normalizeMvola, onboardingProfileSchema, profileSchema, settingsProfileSchema } from "./profile-schema";

const valid = {
  name: " Studio Hery ",
  trade: "Graphiste",
  address: "Lot II A 12, Antananarivo",
  default_currency: "MGA",
  nif: "300 012 3456",
  stat: "74111 11 2020 0 01234",
  tax_regime: "impot_synthetique",
  mvola: "",
  rib: "",
  other: "",
};

describe("profileSchema", () => {
  it("accepte un profil complet et normalise NIF et STAT", () => {
    const result = parseWith(profileSchema, valid);
    expect(result).toEqual({
      ok: true,
      data: { ...valid, name: "Studio Hery", nif: "3000123456", stat: "74111112020001234", mvola: "", rib: "" },
    });
  });

  it("exige chaque champ obligatoire, données fiscales facultatives", () => {
    const result = parseWith(profileSchema, {
      ...valid,
      name: "  ",
      trade: "",
      address: "",
      nif: "",
      stat: "",
      tax_regime: "",
      default_currency: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors).toEqual({
        name: "required",
        trade: "required",
        address: "required",
        default_currency: "invalid_choice",
      });
    }
  });

  it("enregistre des données fiscales vides comme absentes (null)", () => {
    const result = parseWith(profileSchema, { ...valid, nif: " ", stat: "", tax_regime: "" });
    expect(result.ok && [result.data.nif, result.data.stat, result.data.tax_regime]).toEqual([null, null, null]);
  });

  it("contrôle le format du NIF (10 chiffres) et du STAT (17 chiffres)", () => {
    const result = parseWith(profileSchema, { ...valid, nif: "12345", stat: "7411A112020001234" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toEqual({ nif: "nif_format", stat: "stat_format" });
  });

  it("refuse une devise ou un régime inconnus", () => {
    const result = parseWith(profileSchema, { ...valid, default_currency: "GBP", tax_regime: "autre" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toEqual({ default_currency: "invalid_choice", tax_regime: "invalid_choice" });
  });

  it("limite la longueur des textes", () => {
    const result = parseWith(profileSchema, { ...valid, name: "a".repeat(201) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toEqual({ name: "too_long" });
  });

  it("valide MVola et RIB facultatifs", () => {
    const ok = parseWith(profileSchema, { ...valid, mvola: "+261 34 12 345 67", rib: "00005 00001 12345678901 23" });
    expect(ok.ok && ok.data.mvola).toBe("0341234567");
    expect(ok.ok && ok.data.rib).toBe("00005000011234567890123");
    const bad = parseWith(profileSchema, { ...valid, mvola: "032 12 345 67", rib: "1234" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors).toEqual({ mvola: "mvola_format", rib: "rib_format" });
  });

  it("garde une ligne libre de coordonnées (IBAN, PayPal…) sur une seule ligne", () => {
    const ok = parseWith(profileSchema, { ...valid, other: "  IBAN FR76 3000\n BIC AGRIFRPP  " });
    expect(ok.ok && ok.data.other).toBe("IBAN FR76 3000 BIC AGRIFRPP");
    const long = parseWith(profileSchema, { ...valid, other: "x".repeat(301) });
    if (!long.ok) expect(long.fieldErrors).toEqual({ other: "too_long" });
    expect(long.ok).toBe(false);
  });
});

describe("onboardingProfileSchema", () => {
  it("ne demande ni NIF, ni STAT, ni régime fiscal", () => {
    const { name, trade, address, default_currency, mvola, rib, other } = valid;
    const result = parseWith(onboardingProfileSchema, { name, trade, address, default_currency, mvola, rib, other });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.data)).not.toContain("nif");
  });
});

describe("fiscalSchema (avant la première facture)", () => {
  it("exige NIF, STAT et régime fiscal", () => {
    const result = parseWith(fiscalSchema, { nif: "", stat: "", tax_regime: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors).toEqual({ nif: "required", stat: "required", tax_regime: "invalid_choice" });
  });

  it("contrôle le format et normalise", () => {
    const bad = parseWith(fiscalSchema, { nif: "123", stat: "74111 11", tax_regime: "autre" });
    if (!bad.ok) expect(bad.fieldErrors).toEqual({ nif: "nif_format", stat: "stat_format", tax_regime: "invalid_choice" });
    expect(bad.ok).toBe(false);
    const ok = parseWith(fiscalSchema, { nif: "300 012 3456", stat: "74111 11 2020 0 01234", tax_regime: "tva" });
    expect(ok).toEqual({ ok: true, data: { nif: "3000123456", stat: "74111112020001234", tax_regime: "tva" } });
  });
});

describe("hasFiscalInfo", () => {
  it("vrai seulement quand les trois sont remplis", () => {
    expect(hasFiscalInfo({ nif: "3000123456", stat: "74111112020001234", tax_regime: "tva" })).toBe(true);
    expect(hasFiscalInfo({ nif: "3000123456", stat: " ", tax_regime: "tva" })).toBe(false);
    expect(hasFiscalInfo({ nif: null, stat: null, tax_regime: null })).toBe(false);
  });
});

describe("normalizeMvola", () => {
  it("ramène l'indicatif international au format national", () => {
    expect(normalizeMvola("261381234567")).toBe("0381234567");
    expect(normalizeMvola("038 12 345 67")).toBe("0381234567");
  });
});

describe("settingsProfileSchema (Réglages)", () => {
  const empty = { ...valid, nif: "", stat: "", tax_regime: "" };
  it("données fiscales absentes : facultatives", () => {
    expect(parseWith(settingsProfileSchema({ nif: null, stat: null, tax_regime: null }), empty).ok).toBe(true);
  });
  it("données fiscales complètes : corrigeables, plus effaçables", () => {
    const schema = settingsProfileSchema({ nif: "3000123456", stat: "74111112020001234", tax_regime: "tva" });
    expect(parseWith(schema, empty)).toEqual({
      ok: false,
      fieldErrors: { nif: "required", stat: "required", tax_regime: "invalid_choice" },
    });
    expect(parseWith(schema, { ...valid, nif: "300 012 3457" })).toMatchObject({ ok: true, data: { nif: "3000123457" } });
  });
});
