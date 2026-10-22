import { describe, expect, it } from "vitest";
import { APPEARANCE_SCRIPT, parseAppearance, PUBLIC_PATH, serializeAppearance } from "./preference";
import { rootThemeCss, themeColor } from "./themes";

describe("préférence d'apparence", () => {
  it("cookie : aller-retour, valeurs inconnues → défaut Océan clair", () => {
    expect(parseAppearance(serializeAppearance({ mode: "dark", palette: "foret" }))).toEqual({ mode: "dark", palette: "foret" });
    expect(parseAppearance("auto.inconnue")).toEqual({ mode: "auto", palette: "ocean" });
    expect(parseAppearance("<script>")).toEqual({ mode: "light", palette: "ocean" });
    expect(parseAppearance(undefined)).toEqual({ mode: "light", palette: "ocean" });
  });

  it("pages publiques reconnues (jamais au thème de la freelance)", () => {
    expect(PUBLIC_PATH.test("/fr/p/abc")).toBe(true);
    expect(PUBLIC_PATH.test("/en/p/introuvable")).toBe(true);
    expect(PUBLIC_PATH.test("/fr/pipeline")).toBe(false);
  });

  it("script de tête : pose les attributs d'après le cookie, ignore les pages publiques", () => {
    const attrs: Record<string, string> = {};
    const run = (cookie: string, pathname: string) => {
      for (const k of Object.keys(attrs)) delete attrs[k];
      const document = {
        cookie,
        documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
        querySelector: () => null,
        addEventListener: () => {},
      };
      new Function("document", "location", "window", "matchMedia", APPEARANCE_SCRIPT)(document, { pathname }, {}, () => ({ matches: false }));
      return { ...attrs };
    };
    expect(run("a=1; ivn_apparence=dark.prune", "/fr/tableau-de-bord")).toEqual({ "data-mode": "dark", "data-palette": "prune" });
    expect(run("ivn_apparence=dark.prune", "/fr/p/abc")).toEqual({});
    expect(run("ivn_apparence=noir.prune", "/fr/pipeline")).toEqual({});
  });

  it("script de tête : couleur de la barre gardée sur <head> et suivant le système en mode Automatique", () => {
    let dark = false;
    let onChange: (() => void) | undefined;
    let observed: unknown;
    const meta = { content: "#01515a", getAttribute: () => meta.content, setAttribute: (_: string, v: string) => (meta.content = v) };
    const head = {};
    const document = {
      cookie: "ivn_apparence=auto.prune",
      head,
      documentElement: { setAttribute: () => {} },
      querySelector: () => meta,
    };
    const media = () => ({ matches: dark, addEventListener: (_: string, fn: () => void) => (onChange = fn) });
    class Observer {
      observe(target: unknown) {
        observed = target;
      }
    }
    const window = { matchMedia: media, MutationObserver: Observer };
    new Function("document", "location", "window", "matchMedia", APPEARANCE_SCRIPT)(document, { pathname: "/fr/pipeline" }, window, media);
    expect(observed).toBe(head);
    expect(meta.content).toBe(themeColor("prune", false));
    dark = true;
    onChange?.();
    expect(meta.content).toBe(themeColor("prune", true));
  });

  it("feuille sans JavaScript : la palette choisie sur :root, mode automatique selon le système", () => {
    expect(rootThemeCss("dark", "prune")).toContain("color-scheme: dark;");
    expect(rootThemeCss("auto", "ocean")).toContain("@media (prefers-color-scheme: dark)");
  });
});
