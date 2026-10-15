import { describe, expect, it } from "vitest";
import { checkLogoBytes, checkLogoFile, LOGO_MAX_BYTES, logoPath, readLogoUpload, sniffImageType } from "./logo";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

describe("logo", () => {
  it("reconnaît PNG, JPEG et WebP à leurs premiers octets", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(gif)).toBeNull();
  });

  it("contrôle côté navigateur : taille puis type", () => {
    expect(checkLogoFile({ size: LOGO_MAX_BYTES, type: "image/png" })).toBeNull();
    expect(checkLogoFile({ size: LOGO_MAX_BYTES + 1, type: "image/png" })).toBe("logo_too_large");
    expect(checkLogoFile({ size: 10, type: "image/svg+xml" })).toBe("logo_type");
  });

  it("contrôle côté serveur : le contenu fait foi", () => {
    expect(checkLogoBytes(png)).toEqual({ type: "image/png" });
    expect(checkLogoBytes(gif)).toEqual({ error: "logo_type" });
    expect(checkLogoBytes(new Uint8Array(LOGO_MAX_BYTES + 1))).toEqual({ error: "logo_too_large" });
  });

  it("nom versionné dans le dossier du workspace", () => {
    expect(logoPath("ws-1", "image/jpeg", "20261014-ab12")).toBe("ws-1/logo-20261014-ab12.jpg");
  });

  it("lit le champ du formulaire : absent, faux PNG, trop gros, valide", async () => {
    expect(await readLogoUpload(null)).toEqual({ logo: null });
    expect(await readLogoUpload("texte")).toEqual({ logo: null });
    expect(await readLogoUpload(new File([], "vide.png", { type: "image/png" }))).toEqual({ logo: null });
    // Type annoncé image/png, contenu texte : refusé d'après le contenu.
    expect(await readLogoUpload(new File(["pas une image"], "faux.png", { type: "image/png" }))).toEqual({
      error: "logo_type",
    });
    expect(await readLogoUpload(new File([new Uint8Array(LOGO_MAX_BYTES + 1)], "gros.png"))).toEqual({
      error: "logo_too_large",
    });
    const ok = await readLogoUpload(new File([png], "logo.png", { type: "image/png" }));
    expect(ok).toEqual({ logo: { bytes: png, type: "image/png" } });
  });
});
