import { describe, expect, it } from "vitest";
import { digitRuns, matchFiscalNumbers } from "./match";

const numbers = { nif: "3000123456", stat: "74111112020001234" };

describe("digitRuns", () => {
  it("garde les groupes séparés par espaces, points et tirets", () => {
    expect(digitRuns("NIF : 300 012 3456")).toEqual(["3000123456"]);
    expect(digitRuns("STAT 74111.11.2020.0.01234")).toEqual(["74111112020001234"]);
    expect(digitRuns("74111-11-2020-0-01234")).toEqual(["74111112020001234"]);
  });

  it("une étiquette collée coupe la suite sans devenir des chiffres", () => {
    expect(digitRuns("NIF:3000123456")).toEqual(["3000123456"]);
    expect(digitRuns("STAT 7411")).toEqual(["7411"]);
    expect(digitRuns("SIB")).toEqual([]);
  });

  it("corrige O, I, l, S et B seulement à l'intérieur d'un nombre", () => {
    expect(digitRuns("30O0l23456")).toEqual(["3000123456"]);
    expect(digitRuns("B45")).toEqual(["845"]);
    expect(digitRuns("B4S")).toEqual([]);
    // Plus de lettres que de chiffres : ce n'est pas un nombre.
    expect(digitRuns("OSI1")).toEqual([]);
  });

  it("ne joint jamais deux lignes", () => {
    expect(digitRuns("30001\n23456")).toEqual(["30001", "23456"]);
  });
});

describe("matchFiscalNumbers", () => {
  it("NIF et STAT lus avec espaces : vérifié", () => {
    const front = "REPOBLIKAN'I MADAGASIKARA\nCARTE FISCALE\nNIF : 300 012 3456\nSTAT : 74111 11 2020 0 01234";
    expect(matchFiscalNumbers([front, ""], numbers)).toEqual({ nif: true, stat: true, verified: true });
  });

  it("confusions de lecture courantes : vérifié", () => {
    const front = "NIF 3OOO123456\nSTAT 7411l 1l 2O2O 0 O1234";
    expect(matchFiscalNumbers([front], numbers).verified).toBe(true);
  });

  it("NIF sur une face, STAT sur l'autre : vérifié", () => {
    expect(matchFiscalNumbers(["NIF 3000123456", "STAT 74111112020001234"], numbers).verified).toBe(true);
  });

  it("NIF trouvé mais pas le STAT : non vérifié", () => {
    expect(matchFiscalNumbers(["NIF 3000123456\nSTAT 74111 11 2020 0 09999"], numbers)).toEqual({
      nif: true,
      stat: false,
      verified: false,
    });
  });

  it("numéro partiel seulement : non vérifié", () => {
    expect(matchFiscalNumbers(["NIF 300012345", "STAT 7411111202000123"], numbers)).toEqual({
      nif: false,
      stat: false,
      verified: false,
    });
  });

  it("numéro coupé sur deux lignes : non trouvé", () => {
    expect(matchFiscalNumbers(["NIF 30001\n23456\n74111112020001234"], numbers).nif).toBe(false);
  });

  it("aucun texte lu : non vérifié", () => {
    expect(matchFiscalNumbers(["", ""], numbers).verified).toBe(false);
  });

  it("NIF saisi contenu dans le STAT saisi, image avec le STAT seul : non vérifié", () => {
    const inside = { nif: "1112020001", stat: "74111112020001234" };
    expect(matchFiscalNumbers(["STAT 74111 11 2020 0 01234"], inside)).toEqual({ nif: false, stat: true, verified: false });
    // Les deux numéros présents, même collés sur une ligne : vérifié.
    expect(matchFiscalNumbers(["NIF 1112020001", "STAT 74111112020001234"], inside).verified).toBe(true);
    expect(matchFiscalNumbers(["1112020001 74111112020001234"], inside).verified).toBe(true);
  });

  it("numéros saisis invalides : jamais vérifié", () => {
    expect(matchFiscalNumbers(["123"], { nif: "", stat: "" }).verified).toBe(false);
  });
});
