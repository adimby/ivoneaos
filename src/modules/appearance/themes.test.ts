import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";
import { CONTRAST_PAIRS, PALETTE_COLORS, PALETTES, themesCss, TOKENS } from "./themes";

const CSS_FILE = fileURLToPath(new URL("../../app/themes.css", import.meta.url));

describe("palettes de l'application", () => {
  it("chaque palette définit tous les jetons, en clair et en sombre", () => {
    for (const palette of PALETTES) {
      for (const mode of ["light", "dark"] as const) {
        expect(Object.keys(PALETTE_COLORS[palette][mode]).sort(), `${palette} ${mode}`).toEqual([...TOKENS].sort());
      }
    }
  });

  // Contraste AA de chaque couple texte / fond utilisé, pour chaque palette x mode.
  for (const palette of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      it(`${palette} ${mode} : contrastes AA`, () => {
        const colors = PALETTE_COLORS[palette][mode];
        const failures = CONTRAST_PAIRS.map(({ fg, bg, min }) => ({ fg, bg, min, ratio: contrastRatio(colors[fg], colors[bg]) }))
          .filter(({ ratio, min }) => ratio < min)
          .map(({ fg, bg, min, ratio }) => `${fg} sur ${bg} : ${ratio.toFixed(2)} < ${min}`);
        expect(failures).toEqual([]);
      });
    }
  }

  it("Océan clair garde exactement la palette de marque d'origine", () => {
    const ocean = PALETTE_COLORS.ocean.light;
    expect([ocean.lagoon, ocean.turquoise, ocean.terracotta, ocean.spray, ocean.sand, ocean["sand-light"], ocean.ink]).toEqual([
      "#01515a",
      "#2e99ab",
      "#a45c36",
      "#e8edf0",
      "#c9c5ba",
      "#f4f1ea",
      "#0b2a2e",
    ]);
  });

  // UPDATE_THEMES_CSS=1 (npm run themes:css) réécrit le fichier.
  it("src/app/themes.css est à jour", () => {
    if (process.env.UPDATE_THEMES_CSS) writeFileSync(CSS_FILE, themesCss());
    expect(readFileSync(CSS_FILE, "utf8")).toBe(themesCss());
  });
});
