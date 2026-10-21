import { describe, expect, it } from "vitest";
import { buttonClasses } from "./button";

describe("buttonClasses", () => {
  it("marge intérieure par défaut px-5", () => {
    expect(buttonClasses("primary").split(" ")).toContain("px-5");
  });

  it("une marge donnée remplace celle par défaut (pas deux px-* en conflit)", () => {
    const classes = buttonClasses("ghost", false, "px-0").split(" ");
    expect(classes).toContain("px-0");
    expect(classes).not.toContain("px-5");
  });

  it("p-0, pl-2, pe-1 : pas de px-5 ajouté", () => {
    for (const padding of ["p-0", "pl-2", "pe-1"]) {
      expect(buttonClasses("ghost", false, `min-h-12 ${padding}`).split(" ")).not.toContain("px-5");
    }
  });

  it("marge à variante (sm:px-3) : px-5 garde la place de base", () => {
    expect(buttonClasses("ghost", false, "sm:px-3").split(" ")).toContain("px-5");
  });

  it("classes voisines sans marge (pb-2, top-0, opacity-60) : px-5 gardé", () => {
    expect(buttonClasses("ghost", false, "pb-2 top-0 opacity-60").split(" ")).toContain("px-5");
  });
});
