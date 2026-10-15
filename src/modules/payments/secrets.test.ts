import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { decryptSecret, encryptSecret, paymentSecretsAvailable, secretAad, SecretsUnavailableError } = await import("./secrets");

const AAD = secretAad("11111111-1111-1111-1111-111111111111", "papi", "api_key");

describe("secrets AES-256-GCM", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMENT_SECRETS_KEY", randomBytes(32).toString("base64"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("chiffre puis déchiffre (format versionné, IV aléatoire)", () => {
    const a = encryptSecret("cle-papi-123", AAD);
    const b = encryptSecret("cle-papi-123", AAD);
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("cle-papi-123");
    expect(decryptSecret(a, AAD)).toBe("cle-papi-123");
    expect(decryptSecret(b, AAD)).toBe("cle-papi-123");
  });

  it("refuse un chiffré altéré", () => {
    const [v, iv, tag, data] = encryptSecret("pwhsec_secret", AAD).split(":");
    const flip = (part: string) => {
      const bytes = Buffer.from(part, "base64url");
      bytes[0] ^= 1;
      return bytes.toString("base64url");
    };
    expect(() => decryptSecret([v, iv, tag, flip(data)].join(":"), AAD)).toThrow();
    expect(() => decryptSecret([v, iv, flip(tag), data].join(":"), AAD)).toThrow();
    expect(() => decryptSecret([v, flip(iv), tag, data].join(":"), AAD)).toThrow();
    // Étiquette tronquée : refusée (pas d'authentification affaiblie).
    expect(() => decryptSecret([v, iv, Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url"), data].join(":"), AAD)).toThrow();
    expect(() => decryptSecret(["v2", iv, tag, data].join(":"), AAD)).toThrow("Format");
  });

  it("refuse un chiffré copié sur une autre ligne ou une autre colonne (aad)", () => {
    const value = encryptSecret("cle", AAD);
    expect(() => decryptSecret(value, secretAad("22222222-2222-2222-2222-222222222222", "papi", "api_key"))).toThrow();
    expect(() => decryptSecret(value, secretAad("11111111-1111-1111-1111-111111111111", "papi", "signing_secret"))).toThrow();
  });

  it("refuse une autre clé de chiffrement", () => {
    const value = encryptSecret("cle", AAD);
    vi.stubEnv("PAYMENT_SECRETS_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptSecret(value, AAD)).toThrow();
  });

  it("sans clé valide : désactivé proprement", () => {
    vi.stubEnv("PAYMENT_SECRETS_KEY", "");
    expect(paymentSecretsAvailable()).toBe(false);
    expect(() => encryptSecret("x", AAD)).toThrow(SecretsUnavailableError);
    vi.stubEnv("PAYMENT_SECRETS_KEY", randomBytes(16).toString("base64"));
    expect(paymentSecretsAvailable()).toBe(false);
  });
});
