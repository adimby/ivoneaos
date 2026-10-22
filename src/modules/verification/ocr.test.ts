import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { matchFiscalNumbers } from "./match";
import { normalizeImage, readCardTexts } from "./ocr";

vi.mock("server-only", () => ({}));

const NUMBERS = { nif: "3000123456", stat: "74111112020001234" };

// Carte de test : texte noir sur fond clair, comme une photo bien cadrée.
async function card(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">
    <rect width="100%" height="100%" fill="#f3efe2"/>
    <text x="60" y="120" font-family="DejaVu Sans, Arial, sans-serif" font-size="40" font-weight="bold">CARTE FISCALE</text>
    <text x="60" y="320" font-family="DejaVu Sans, Arial, sans-serif" font-size="60">NIF : 3000 123 456</text>
    <text x="60" y="460" font-family="DejaVu Sans, Arial, sans-serif" font-size="60">STAT : 74111 11 2020 0 01234</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

describe("normalizeImage", () => {
  it("redresse selon l'EXIF petit-boutiste (téléphone Android), réduit et passe en gris", async () => {
    // Pixels couchés (3000 × 4000) avec orientation 6 : à afficher tournés de 90°.
    const photo = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: "#c33" } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await normalizeImage(photo)).metadata();
    expect([meta.width, meta.height]).toEqual([2000, 1500]);
    expect(meta.channels).toBe(1);
    expect(meta.orientation ?? 1).toBe(1);
  });

  it("n'agrandit pas une petite image", async () => {
    const meta = await sharp(await normalizeImage(await card())).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 700]);
  });
});

describe("readCardTexts", () => {
  const enough = (texts: string[]) => matchFiscalNumbers(texts, NUMBERS).verified;

  it.each([0, 90, 180])("retrouve les numéros d'une carte tournée de %i°", async (angle) => {
    const photo = await sharp(await card()).rotate(angle).jpeg().toBuffer();
    const texts = await readCardTexts([new Uint8Array(photo)], 30_000, enough);
    expect(texts && matchFiscalNumbers(texts, NUMBERS).verified).toBe(true);
  }, 40_000);
});
