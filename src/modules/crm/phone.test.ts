import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneSearchDigits, telHref, whatsappHref } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["034 12 345 67", "+261341234567"],
    ["0341234567", "+261341234567"],
    ["034-12-345-67", "+261341234567"],
    ["34 12 345 67", "+261341234567"],
    ["+261 34 12 345 67", "+261341234567"],
    ["261341234567", "+261341234567"],
    ["00261 32 12 345 67", "+261321234567"],
    ["+261 034 12 345 67", "+261341234567"],
    ["038 98 765 43", "+261389876543"],
    ["020 22 123 45", "+261202212345"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["0033 6 12 34 56 78", "+33612345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "abc", "034 12 345", "034 12 345 678", "+261 44 12 345 67", "12", "+0612345678", "06 12 34 56 78"])(
    "refuse %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("affichage et liens", () => {
  it("groupe un numéro malgache", () => {
    expect(formatPhone("+261341234567")).toBe("+261 34 12 345 67");
    // Étranger : indicatif séparé, puis blocs de 2 chiffres (3-3-4 en Amérique du Nord).
    expect(formatPhone("+33612345678")).toBe("+33 6 12 34 56 78");
    expect(formatPhone("+12025550123")).toBe("+1 202 555 0123");
    expect(formatPhone("+23052512345")).toBe("+230 52 51 23 45");
    expect(formatPhone("+262692123456")).toBe("+262 6 92 12 34 56");
    expect(formatPhone("+8613812345678")).toBe("+86 1 38 12 34 56 78");
    expect(formatPhone("pas un numéro")).toBe("pas un numéro");
  });
  it("tel: et wa.me", () => {
    expect(telHref("+261341234567")).toBe("tel:+261341234567");
    expect(whatsappHref("+261341234567")).toBe("https://wa.me/261341234567");
  });
  it("chiffres de recherche", () => {
    expect(phoneSearchDigits("034 12")).toBe("3412");
    expect(phoneSearchDigits("+261 34")).toBe("34");
    expect(phoneSearchDigits("Rakoto")).toBeNull();
    expect(phoneSearchDigits("5")).toBeNull();
  });
});
