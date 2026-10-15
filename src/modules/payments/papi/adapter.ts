import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  CreatedLink,
  LinkState,
  LinkStatus,
  Notification,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ProviderResult,
} from "../provider";

// Adaptateur Papi, d'après la doc officielle :
//   https://docs.papi.mg/fr/docs/api/payment-link/create-payment-link
//   https://docs.papi.mg/fr/docs/api/payment-link/get-payment-link-status
//   https://docs.papi.mg/fr/docs/developper-guide/securing-notifications
// URL de base configurable (PAPI_API_BASE_URL) pour les tests de bout en bout, qui
// remplacent Papi par un serveur simulé : Papi n'offre pas de bac à sable gratuit.

export const PAPI_DEFAULT_BASE_URL = "https://app.papi.mg/engine/api";
// Montant minimum d'un lien (doc : « Minimum 300 »).
export const PAPI_MIN_AMOUNT = 300;
// validDuration : entier > 0, au plus 596 heures.
export const PAPI_MAX_VALID_HOURS = 596;
// Écart toléré entre l'horodatage signé et l'heure du serveur (doc : 300 secondes).
export const PAPI_SIGNATURE_TOLERANCE_SECONDS = 300;
const TIMEOUT_MS = 10_000;

export function papiBaseUrl(): string {
  return (process.env.PAPI_API_BASE_URL?.trim() || PAPI_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

const METHODS: Record<string, PaymentMethod> = {
  MVOLA: "MVOLA",
  ORANGE_MONEY: "ORANGE_MONEY",
  AIRTEL_MONEY: "AIRTEL_MONEY",
  // BRED : paiement par carte (Visa).
  BRED: "CARD",
};
const LINK_STATUSES: LinkStatus[] = ["ACTIVE", "EXPIRED", "PAID", "DISABLED"];
const PAYMENT_STATUSES: PaymentStatus[] = ["SUCCESS", "PENDING", "FAILED"];

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
// Montants en ariary entiers (« 15000.0 » arrive comme 15000 après JSON.parse).
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) ? value : null);
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  (values as readonly unknown[]).includes(value) ? (value as T) : null;
const method = (value: unknown): PaymentMethod | null => (typeof value === "string" ? (METHODS[value] ?? null) : null);

async function call(path: string, apiKey: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(`${papiBaseUrl()}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init.headers, Token: apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null; // réseau coupé, délai dépassé
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = (await response.json()) as unknown;
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function errorMessage(body: Record<string, unknown> | null): string | undefined {
  const error = body?.error;
  return typeof error === "object" && error !== null ? (str((error as Record<string, unknown>).message) ?? undefined) : undefined;
}

function data(body: Record<string, unknown> | null): Record<string, unknown> | null {
  const value = body?.data;
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

// En-tête « X-Papi-Signature: t=<secondes>,v1=<hex> » ; v1 = HMAC-SHA256(secret, t + "." + corps brut).
export function verifyPapiSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string,
  { now = new Date(), toleranceSeconds = PAPI_SIGNATURE_TOLERANCE_SECONDS }: { now?: Date; toleranceSeconds?: number } = {},
): boolean {
  if (!header || !secret) return false;
  const parts: Record<string, string> = {};
  for (const item of header.split(",")) {
    const [key, ...rest] = item.trim().split("=");
    parts[key] = rest.join("=");
  }
  const { t, v1 } = parts;
  if (!/^\d{1,18}$/.test(t ?? "") || !/^[0-9a-f]{64}$/.test(v1 ?? "")) return false;
  if (toleranceSeconds > 0 && Math.abs(Math.floor(now.getTime() / 1000) - Number(t)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(v1, "hex"));
}

export function parsePapiNotification(body: unknown): Notification | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const merchantReference = str(b.merchantPaymentReference);
  if (!merchantReference) return null;
  return {
    merchantReference,
    // Dans la notification, paymentReference est la référence de Papi (UUID).
    providerReference: str(b.paymentReference),
    status: oneOf(PAYMENT_STATUSES, b.paymentStatus),
    amount: whole(b.amount),
    fee: Math.max(whole(b.fee) ?? 0, 0),
    method: method(b.paymentMethod),
    notificationToken: str(b.notificationToken),
  };
}

export const papi: PaymentProvider = {
  async createLink(apiKey, input): Promise<ProviderResult<CreatedLink>> {
    const response = await call("/payment-links", apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amount,
        reference: input.reference,
        clientName: input.clientName.slice(0, 200),
        description: input.description.slice(0, 255),
        successUrl: input.successUrl,
        failureUrl: input.failureUrl,
        notificationUrl: input.notificationUrl,
        validDuration: Math.min(Math.max(Math.round(input.validDurationHours), 1), PAPI_MAX_VALID_HOURS),
      }),
    });
    if (!response) return { ok: false, error: "unavailable" };
    const body = await readJson(response);
    if (response.ok) {
      const d = data(body);
      const url = str(d?.paymentLink);
      if (!url?.startsWith("https://")) return { ok: false, error: "unavailable", message: "invalid_response" };
      const expires = whole(d?.linkExpirationDateTime);
      return {
        ok: true,
        value: { url, notificationToken: str(d?.notificationToken), expiresAt: expires === null ? null : new Date(expires) },
      };
    }
    const message = errorMessage(body);
    // Clé absente ou inconnue : 400 « API key invalide » sur cet endpoint (pas 401).
    if (response.status === 401 || (response.status === 400 && /api key/i.test(message ?? ""))) {
      return { ok: false, error: "unauthorized", message };
    }
    if (response.status === 409) return { ok: false, error: "conflict", message };
    if (response.status >= 400 && response.status < 500) return { ok: false, error: "rejected", message };
    return { ok: false, error: "unavailable", message };
  },

  async getLinkStatus(apiKey, reference): Promise<ProviderResult<LinkState>> {
    const response = await call(`/payment-links/${encodeURIComponent(reference)}`, apiKey);
    if (!response) return { ok: false, error: "unavailable" };
    const body = await readJson(response);
    if (response.status === 401) return { ok: false, error: "unauthorized", message: errorMessage(body) };
    if (response.status === 404) return { ok: false, error: "not_found", message: errorMessage(body) };
    if (!response.ok) return { ok: false, error: "unavailable", message: errorMessage(body) };
    const d = data(body);
    const linkStatus = oneOf(LINK_STATUSES, d?.linkStatus);
    if (!d || !linkStatus) return { ok: false, error: "unavailable", message: "invalid_response" };
    return {
      ok: true,
      value: {
        linkStatus,
        paymentStatus: oneOf(PAYMENT_STATUSES, d.paymentStatus),
        method: method(d.paymentMethod),
        amount: whole(d.amount),
        // Dans la relecture, la référence de Papi s'appelle papiPaymentReference.
        providerReference: str(d.papiPaymentReference),
        notificationToken: str(d.notificationToken),
      },
    };
  },

  // Lecture d'une référence qui n'existe pas : 401 = clé inconnue, 404 = clé valide.
  async verifyCredentials(apiKey) {
    const result = await papi.getLinkStatus(apiKey, `IVN-CHECK-${randomUUID()}`);
    if (result.ok || result.error === "not_found") return "valid";
    return result.error === "unauthorized" ? "invalid" : "unavailable";
  },

  verifyNotification(rawBody, signature, secret, now = new Date()) {
    if (!verifyPapiSignature(rawBody, signature, secret, { now })) return null;
    try {
      return parsePapiNotification(JSON.parse(rawBody.toString("utf8")));
    } catch {
      return null;
    }
  },
};
