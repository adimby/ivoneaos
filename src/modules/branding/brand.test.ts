import { describe, expect, it } from "vitest";
import { contrastRatio, readableTextOn } from "@/lib/contrast";
import { checkBannerBytes, checkBannerFile } from "./banner";
import {
  accentPressed,
  brandColors,
  COLOR_PRESETS,
  DEFAULT_BRAND,
  isReadablePrimary,
  LIGHT_SURFACES,
  mixHex,
  normalizeHex,
  parseBrand,
  primarySoft,
} from "./brand";
import { brandingSchema } from "./schema";

const valid = {
  show_logo: "on",
  logo_size: "large",
  logo_position: "center",
  primary_color: "#1f5a3d",
  accent_color: "c9822b",
  font: "spectral",
  invoice_footer: "  Merci pour ta confiance  ",
  remove_banner: "",
};

describe("contraste", () => {
  it("valeurs de référence WCAG", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#A45C36", "#FFFFFF")).toBeCloseTo(5.03, 1);
  });
  it("texte blanc ou noir : toujours au moins 4,5:1, quelle que soit la couleur", () => {
    for (const hex of colorGrid()) expect(contrastRatio(hex, readableTextOn(hex)), hex).toBeGreaterThanOrEqual(4.5);
  });
});

describe("image de marque", () => {
  it("les couleurs proposées sont lisibles", () => {
    for (const preset of COLOR_PRESETS) expect(isReadablePrimary(preset.primary), preset.key).toBe(true);
  });

  it("une couleur principale trop claire est refusée", () => {
    expect(isReadablePrimary("#F2C14E")).toBe(false);
    expect(isReadablePrimary("#2E99AB")).toBe(false);
    const result = brandingSchema.safeParse({ ...valid, primary_color: "#F2C14E" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["primary_color"], message: "primary_contrast" });
  });

  it("formulaire : couleurs normalisées, choix connus, pied de page nettoyé", () => {
    expect(brandingSchema.parse(valid)).toEqual({
      show_logo: true,
      logo_size: "large",
      logo_position: "center",
      primary_color: "#1F5A3D",
      accent_color: "#C9822B",
      font: "spectral",
      invoice_footer: "Merci pour ta confiance",
      remove_banner: false,
    });
    expect(brandingSchema.parse({ ...valid, show_logo: "", invoice_footer: " " })).toMatchObject({ show_logo: false, invoice_footer: null });
    expect(brandingSchema.safeParse({ ...valid, font: "comic-sans" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...valid, logo_size: "huge" }).success).toBe(false);
    expect(brandingSchema.safeParse({ ...valid, accent_color: "rouge" }).error?.issues[0].message).toBe("color_format");
    expect(brandingSchema.safeParse({ ...valid, invoice_footer: "x".repeat(301) }).success).toBe(false);
  });

  it("hexadécimal normalisé", () => {
    expect(normalizeHex("abcdef")).toBe("#ABCDEF");
    expect(normalizeHex(" #01515a ")).toBe("#01515A");
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("url(x)")).toBeNull();
  });

  it("copie figée sans marque (document ancien) : aspect d'origine", () => {
    expect(parseBrand(undefined)).toEqual(DEFAULT_BRAND);
    expect(parseBrand({ font: "inconnue", logo_size: 3, primary_color: "javascript:" })).toEqual(DEFAULT_BRAND);
    expect(parseBrand({ show_logo: false, banner_path: "w/banner-1.png", font: "nunito" })).toMatchObject({
      showLogo: false,
      bannerPath: "w/banner-1.png",
      font: "nunito",
    });
  });

  it("couleur principale illisible dans une copie figée : couleur par défaut", () => {
    expect(brandColors({ primary: "#FFFF00", accent: "#000000" })).toEqual({
      primary: DEFAULT_BRAND.primary,
      onPrimary: "#FFFFFF",
      primarySoft: "#E1EAEB",
      accent: "#000000",
      onAccent: "#FFFFFF",
      accentPressed: "#000000",
      accentEdge: null,
    });
  });

  it("accent trop pâle (< 3:1 sur les fonds clairs) : contour à la couleur principale", () => {
    expect(brandColors({ primary: "#5B2B5E", accent: "#FFFFFF" }).accentEdge).toBe("#5B2B5E");
    expect(brandColors({ primary: "#5B2B5E", accent: "#D4A24C" }).accentEdge).toBe("#5B2B5E");
    expect(brandColors({ primary: "#1F5A3D", accent: "#C0392B" }).accentEdge).toBeNull();
    for (const preset of COLOR_PRESETS) {
      const { accent, accentEdge } = brandColors(preset);
      const edge = accentEdge ?? accent;
      for (const surface of LIGHT_SURFACES) expect(contrastRatio(edge, surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

// Échantillon de couleurs, du noir au blanc.
function* colorGrid() {
  for (let r = 0; r < 256; r += 51) {
    for (let g = 0; g < 256; g += 17) {
      for (let b = 0; b < 256; b += 51) yield `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    }
  }
}

describe("teintes dérivées de la marque", () => {
  it("mélange de deux couleurs", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#01515A", "#FFFFFF", 0)).toBe("#01515A");
    expect(mixHex("#01515A", "#FFFFFF", 1)).toBe("#FFFFFF");
    expect(mixHex("#A45C36", "#000000", 0.12)).toBe("#905130");
  });

  it("fond pâle de la couleur principale : teinte pâle, couleur principale et encre lisibles dessus", () => {
    expect(primarySoft("#5B2B5E")).toBe("#EBE6EC");
    for (const primary of colorGrid()) {
      if (!isReadablePrimary(primary)) continue;
      const soft = primarySoft(primary);
      expect(contrastRatio(primary, soft), primary).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#0B2A2E", soft), primary).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("survol du bouton : 12 % plus foncé, texte lisible sur les deux teintes", () => {
    expect(accentPressed("#A45C36")).toBe("#905130");
    expect(accentPressed("#D4A24C")).toBe("#BB8F43");
    for (const accent of colorGrid()) {
      const text = readableTextOn(accent);
      const pressed = accentPressed(accent);
      expect(contrastRatio(pressed, text), accent).toBeGreaterThanOrEqual(4.5);
      if (accent !== "#000000") expect(pressed, accent).not.toBe(accent);
    }
  });

  it("le contour d'un accent pâle tient aussi sur sa teinte de survol", () => {
    for (const accent of colorGrid()) {
      const { accentEdge, accentPressed: pressed } = brandColors({ primary: "#01515A", accent });
      if (accentEdge) continue;
      for (const surface of LIGHT_SURFACES) {
        expect(contrastRatio(accent, surface), accent).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(pressed, surface), accent).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("bannière", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  it("PNG ou JPEG reconnus à leur contenu, WebP et texte refusés", () => {
    expect(checkBannerBytes(png)).toEqual({ type: "image/png" });
    expect(checkBannerBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ type: "image/jpeg" });
    expect(checkBannerBytes(webp)).toEqual({ error: "banner_type" });
    expect(checkBannerBytes(new TextEncoder().encode("<svg onload=alert(1)>"))).toEqual({ error: "banner_type" });
  });
  it("1 Mo au plus", () => {
    expect(checkBannerBytes(new Uint8Array(1024 * 1024 + 1))).toEqual({ error: "banner_too_large" });
    expect(checkBannerFile({ size: 2_000_000, type: "image/png" })).toBe("banner_too_large");
    expect(checkBannerFile({ size: 10, type: "image/webp" })).toBe("banner_type");
    expect(checkBannerFile({ size: 10, type: "image/jpeg" })).toBeNull();
  });
});
