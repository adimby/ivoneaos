import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Secrets des comptes de paiement (clé API et secret de signature Papi), chiffrés au repos
// en AES-256-GCM avec PAYMENT_SECRETS_KEY (32 octets en base64). Format versionné :
// « v1:<iv>:<tag>:<chiffré> » (base64url), IV aléatoire de 12 octets à chaque chiffrement.
// Les données associées (aad, ex. « <workspace>:papi:api_key ») lient le chiffré à sa
// ligne et à sa colonne : copié ailleurs, il ne se déchiffre plus. Jamais journalisé,
// jamais renvoyé au navigateur.

const VERSION = "v1";
const IV_BYTES = 12;

export class SecretsUnavailableError extends Error {
  constructor() {
    super("PAYMENT_SECRETS_KEY absente ou invalide");
  }
}

function readKey(): Buffer | null {
  const raw = process.env.PAYMENT_SECRETS_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

// Chiffrement possible ? Sans clé valide, la connexion Papi est désactivée.
export function paymentSecretsAvailable(): boolean {
  return readKey() !== null;
}

export function encryptSecret(plaintext: string, aad: string): string {
  const key = readKey();
  if (!key) throw new SecretsUnavailableError();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, ...[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url"))].join(":");
}

// Lève une erreur si le chiffré est altéré, d'une autre ligne (aad) ou d'une autre clé.
export function decryptSecret(value: string, aad: string): string {
  const key = readKey();
  if (!key) throw new SecretsUnavailableError();
  const [version, iv, tag, encrypted, ...rest] = value.split(":");
  if (version !== VERSION || !iv || !tag || encrypted === undefined || rest.length > 0) {
    throw new Error("Format de secret inconnu");
  }
  // Étiquette complète exigée (16 octets) : une étiquette tronquée serait sinon acceptée.
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function secretAad(workspaceId: string, provider: string, field: "api_key" | "signing_secret"): string {
  return `${workspaceId}:${provider}:${field}`;
}

// Copie de la clé API ou du secret de signature gardée sur un lien de paiement (liée à sa
// référence).
export function linkSecretAad(workspaceId: string, provider: string, reference: string, field: "api_key" | "signing_secret"): string {
  return `${workspaceId}:${provider}:link_${field}:${reference}`;
}
