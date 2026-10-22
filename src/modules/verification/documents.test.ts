import { describe, expect, it } from "vitest";
import { checkFiscalBytes, checkFiscalFile, fiscalFilePath, invoicesLeft, isFiscalFilePath } from "./documents";

const ws = "11111111-2222-3333-4444-555555555555";
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("photos de la carte fiscale", () => {
  it("contrôle navigateur : taille et type", () => {
    expect(checkFiscalFile({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(checkFiscalFile({ size: 1000, type: "image/webp" })).toBeNull();
    expect(checkFiscalFile({ size: 10 * 1024 * 1024 + 1, type: "image/png" })).toBe("too_large");
    expect(checkFiscalFile({ size: 1000, type: "application/pdf" })).toBe("type");
  });

  it("contrôle serveur : type reconnu au contenu", () => {
    expect(checkFiscalBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBeNull();
    expect(checkFiscalBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("type");
    expect(checkFiscalBytes(new Uint8Array())).toBe("too_large");
  });

  it("chemin dans le dossier du workspace seulement", () => {
    const path = fiscalFilePath(ws, "image/jpeg", id);
    expect(path).toBe(`${ws}/${id}.jpg`);
    expect(isFiscalFilePath(path, ws)).toBe(true);
    expect(isFiscalFilePath(path, "99999999-2222-3333-4444-555555555555")).toBe(false);
    expect(isFiscalFilePath(`${ws}/../x/${id}.jpg`, ws)).toBe(false);
    expect(isFiscalFilePath(`${ws}/${id}.pdf`, ws)).toBe(false);
    expect(isFiscalFilePath(null, ws)).toBe(false);
  });

  it("factures restantes avant la vérification", () => {
    expect(invoicesLeft("unverified", 0)).toBe(3);
    expect(invoicesLeft("pending", 1)).toBe(2);
    expect(invoicesLeft("rejected", 5)).toBe(0);
    expect(invoicesLeft("verified", 8)).toBeNull();
  });
});
