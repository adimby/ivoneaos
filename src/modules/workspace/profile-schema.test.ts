import { describe, expect, it } from "vitest";
import { parseWith } from "@/lib/forms";
import { normalizeMvola, profileSchema } from "./profile-schema";

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
};

describe("profileSchema", () => {
  it("accepte un profil complet et normalise NIF et STAT", () => {
    const result = parseWith(profileSchema, valid);
    expect(result).toEqual({
      ok: true,
      data: { ...valid, name: "Studio Hery", nif: "3000123456", stat: "74111112020001234", mvola: "", rib: "" },
    });
  });

  it("exige chaque champ obligatoire", () => {
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
        nif: "required",
        stat: "required",
        tax_regime: "invalid_choice",
        default_currency: "invalid_choice",
      });
    }
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
});

describe("normalizeMvola", () => {
  it("ramène l'indicatif international au format national", () => {
    expect(normalizeMvola("261381234567")).toBe("0381234567");
    expect(normalizeMvola("038 12 345 67")).toBe("0381234567");
  });
});
