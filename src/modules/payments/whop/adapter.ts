import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreatedLink, PaymentProvider, ProviderError, ProviderResult } from "../provider";

// Adaptateur Whop (factures EUR/USD), d'après la doc officielle et le SDK @whop/sdk 2.5.0 :
//   https://docs.whop.com/developer/platforms/enroll-connected-accounts
//     POST /accounts, POST /account_links (use_case account_onboarding)
//   https://docs.whop.com/developer/platforms/collect-payments-for-connected-accounts
//     POST /checkout_configurations : paiement unique (plan.plan_type one_time) créé sur le
//     compte connecté (account_id), commission de la plateforme plan.application_fee_amount
//     (exigée en retour dans la réponse, sinon plan_mismatch)
//   https://docs.whop.com/developer/guides/webhooks
//     Standard Webhooks : HMAC-SHA256 de « webhook-id.webhook-timestamp.corps brut »,
//     clé = le secret ws_… tel quel, en-tête « webhook-signature: v1,<base64> », 5 minutes.
// Authentification : clé API de la plateforme (WHOP_API_KEY) en « Authorization: Bearer ».
// Version d'API figée (en-tête Api-Version-Date, valeur par défaut du SDK 2.5.0) : la forme
// des réponses ne change pas sous nos pieds. URL de base configurable (WHOP_API_BASE_URL)
// pour les tests de bout en bout (Whop simulé, e2e/whop-mock.mjs).

export const WHOP_DEFAULT_BASE_URL = "https://api.whop.com/api/v1";
export const WHOP_API_VERSION_DATE = "2026-10-13-1";
export const WHOP_SIGNATURE_TOLERANCE_SECONDS = 300;
const TIMEOUT_MS = 10_000;
// Devises proposées par Whop au MVP : celles des factures non payables par Papi.
export const WHOP_CURRENCIES = ["EUR", "USD"] as const;
export type WhopCurrency = (typeof WHOP_CURRENCIES)[number];

export function whopBaseUrl(): string {
  return (process.env.WHOP_API_BASE_URL?.trim() || WHOP_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

// Clé de la plateforme. Whop n'est proposé qu'avec elle ET le secret du webhook
// (whopEnabled, service.ts) : sans webhook, un paiement ne serait jamais enregistré.
export function whopApiKey(): string | null {
  return process.env.WHOP_API_KEY?.trim() || null;
}

// Commission d'Ivonea OS sur chaque paiement Whop, en pourcentage (0 par défaut).
export function platformFeePercent(): number {
  const value = Number(process.env.WHOP_PLATFORM_FEE_PERCENT?.trim() || 0);
  return Number.isFinite(value) && value > 0 && value < 100 ? value : 0;
}

// Commission en unités mineures : arrondie, positive et inférieure au montant (doc :
// « must be positive and less than the total payment amount »), sinon aucune.
export function applicationFee(amountMinor: number, percent: number): number {
  const fee = Math.round((amountMinor * percent) / 100);
  return fee > 0 && fee < amountMinor ? fee : 0;
}

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const obj = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// Unités mineures (centimes) ↔ montant décimal attendu par Whop (10.5 = 10,50 €).
export function toMajor(amountMinor: number): number {
  return amountMinor / 100;
}

// Montant Whop → centimes. Forme datée (Money : { amount: "10.50", decimals: 2 }) ou
// ancienne forme (nombre 10.5). null si illisible ou plus précis que le centime.
export function moneyToMinor(value: unknown): number | null {
  const money = obj(value);
  const raw = money ? money.amount : value;
  if (typeof raw === "number") {
    const minor = Math.round(raw * 100);
    return Number.isSafeInteger(minor) && minor >= 0 && Math.abs(raw * 100 - minor) < 1e-6 ? minor : null;
  }
  if (typeof raw === "string") {
    const m = /^(\d{1,13})(?:\.(\d{1,2})0*)?$/.exec(raw.trim());
    if (!m) return null;
    return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  }
  return null;
}

async function call(path: string, apiKey: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<Response | null> {
  const { idempotencyKey, ...rest } = init;
  try {
    return await fetch(`${whopBaseUrl()}${path}`, {
      ...rest,
      headers: {
        Accept: "application/json",
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        "Api-Version-Date": WHOP_API_VERSION_DATE,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null; // réseau coupé, délai dépassé
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return obj(await response.json());
  } catch {
    return null;
  }
}

function failure(response: Response | null, body: Record<string, unknown> | null): { ok: false; error: ProviderError; message?: string } {
  if (!response) return { ok: false, error: "unavailable" };
  const message = str(obj(body?.error)?.message) ?? undefined;
  if (response.status === 401 || response.status === 403) return { ok: false, error: "unauthorized", message };
  if (response.status === 404) return { ok: false, error: "not_found", message };
  if (response.status === 409) return { ok: false, error: "conflict", message };
  if (response.status === 429 || response.status >= 500) return { ok: false, error: "unavailable", message };
  return { ok: false, error: "rejected", message };
}

// Adresse de paiement : URL complète, ou chemin « /checkout/ch_…/ » (doc) sur whop.com.
function purchaseUrl(value: unknown): string | null {
  const url = str(value);
  if (!url) return null;
  const full = url.startsWith("/") ? `https://whop.com${url}` : url;
  return full.startsWith("https://") ? full : null;
}

// Compte connecté de la freelance, créé sous le compte de la plateforme. Idempotent sur
// (e-mail, metadata.external_id) : external_id = identifiant du workspace.
export async function createConnectedAccount(
  apiKey: string,
  input: { email: string; title: string; externalId: string },
): Promise<ProviderResult<{ id: string }>> {
  const response = await call("/accounts", apiKey, {
    method: "POST",
    body: JSON.stringify({ email: input.email, title: input.title.slice(0, 100), metadata: { external_id: input.externalId } }),
  });
  const body = response && (await readJson(response));
  if (!response?.ok) return failure(response, body ?? null);
  const id = str(body?.id);
  return id?.startsWith("biz_") ? { ok: true, value: { id } } : { ok: false, error: "unavailable", message: "invalid_response" };
}

// Lien d'inscription (vérification d'identité) hébergé par Whop, valable peu de temps.
export async function createOnboardingLink(
  apiKey: string,
  input: { accountId: string; returnUrl: string; refreshUrl: string },
): Promise<ProviderResult<{ url: string }>> {
  const response = await call("/account_links", apiKey, {
    method: "POST",
    body: JSON.stringify({
      account_id: input.accountId,
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
      use_case: "account_onboarding",
    }),
  });
  const body = response && (await readJson(response));
  if (!response?.ok) return failure(response, body ?? null);
  const url = str(body?.url);
  return url?.startsWith("https://") ? { ok: true, value: { url } } : { ok: false, error: "unavailable", message: "invalid_response" };
}

// Le compte connecté peut-il encaisser par carte ? (capabilities.accept_card_payments)
export async function getAccountStatus(apiKey: string, accountId: string): Promise<ProviderResult<{ canAcceptCards: boolean }>> {
  const response = await call(`/accounts/${encodeURIComponent(accountId)}`, apiKey);
  const body = response && (await readJson(response));
  if (!response?.ok) return failure(response, body ?? null);
  return { ok: true, value: { canAcceptCards: obj(body?.capabilities)?.accept_card_payments === "active" } };
}

// Paiement unique sur le compte connecté (direct charge) : la freelance encaisse, supporte
// les frais Whop et les litiges ; la plateforme prélève sa commission. Idempotent sur la
// référence (en-tête Idempotency-Key), reprise dans les métadonnées du paiement.
export const whop: Pick<PaymentProvider, "createLink"> = {
  async createLink(apiKey, input): Promise<ProviderResult<CreatedLink>> {
    if (!input.accountId || !input.currency) return { ok: false, error: "rejected", message: "account_or_currency_missing" };
    const fee = input.applicationFee ?? 0;
    const response = await call("/checkout_configurations", apiKey, {
      method: "POST",
      idempotencyKey: input.reference,
      body: JSON.stringify({
        account_id: input.accountId,
        mode: "payment",
        // Le plan appartient au compte connecté, comme le paiement : account_id (champ typé
        // du SDK 2.5.0, CreateCheckoutConfigurationsRequest.Plan) et company_id (référence
        // API), même valeur. adaptive_pricing_enabled false : le client paie dans la devise
        // de la facture, sans conversion par Whop (presentment_total du webhook = la
        // facture). application_fee_amount (doc « collect payments », absent des types du
        // SDK) : vérifié dans la réponse ci-dessous.
        plan: {
          account_id: input.accountId,
          company_id: input.accountId,
          plan_type: "one_time",
          initial_price: toMajor(input.amount),
          currency: input.currency.toLowerCase(),
          adaptive_pricing_enabled: false,
          title: input.description.slice(0, 100),
          ...(fee > 0 && { application_fee_amount: toMajor(fee) }),
        },
        metadata: { ivonea_reference: input.reference },
        redirect_url: input.successUrl,
      }),
    });
    const body = response && (await readJson(response));
    if (!response?.ok) return failure(response, body ?? null);
    const id = str(body?.id);
    const url = purchaseUrl(body?.purchase_url);
    if (!id || !url) return { ok: false, error: "unavailable", message: "invalid_response" };
    // Plan renvoyé par Whop différent de la demande (devise ignorée, prix converti) : le
    // paiement ne correspondrait pas à la facture, le lien n'est pas proposé. Commission
    // demandée : la réponse doit la renvoyer (plan.application_fee_amount) ; sinon rien ne
    // prouve que Whop l'a prise en compte (le Plan de la réponse du SDK 2.5.0 n'a pas ce
    // champ) et la commission d'Ivonea serait perdue sans signal : lien refusé.
    const plan = obj(body?.plan);
    const planCurrency = str(plan?.currency);
    if (
      (planCurrency && planCurrency.toUpperCase() !== input.currency) ||
      (typeof plan?.initial_price === "number" && Math.round(plan.initial_price * 100) !== input.amount) ||
      plan?.adaptive_pricing_enabled === true ||
      (fee > 0 && !(typeof plan?.application_fee_amount === "number" && Math.round(plan.application_fee_amount * 100) === fee))
    ) {
      return { ok: false, error: "rejected", message: "plan_mismatch" };
    }
    // notificationToken : identifiant de la configuration (ch_…), comparé au webhook.
    return { ok: true, value: { url, notificationToken: id, expiresAt: null } };
  },
};

// Configuration de paiement retirée chez Whop (DELETE /checkout_configurations/{id}, SDK
// 2.5.0 : « so its checkout URL can no longer be used ») : lien remplacé ou facture réglée
// autrement. Déjà supprimée (404) : même résultat.
export async function deleteCheckoutConfiguration(apiKey: string, checkoutId: string): Promise<ProviderResult<null>> {
  const response = await call(`/checkout_configurations/${encodeURIComponent(checkoutId)}`, apiKey, { method: "DELETE" });
  if (response?.ok || response?.status === 404) return { ok: true, value: null };
  return failure(response, response ? await readJson(response) : null);
}

// ---------------------------------------------------------------------------
// Webhooks (Standard Webhooks)
// ---------------------------------------------------------------------------

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifyWhopSignature(
  rawBody: Buffer,
  headers: WebhookHeaders,
  secret: string,
  { now = new Date(), toleranceSeconds = WHOP_SIGNATURE_TOLERANCE_SECONDS }: { now?: Date; toleranceSeconds?: number } = {},
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${timestamp}.`).update(rawBody).digest();
  // Plusieurs signatures possibles (rotation du secret), séparées par des espaces.
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type WhopPayment = {
  providerReference: string;
  merchantReference: string | null;
  checkoutId: string | null;
  accountId: string | null;
  currency: WhopCurrency | null;
  amount: number | null;
  fee: number;
  paidAt: string | null;
};

// Événement payment.succeeded → paiement lu ; null pour un autre événement, un paiement non
// encaissé ou sans identifiant. Champs de l'objet Payment (SDK @whop/sdk 2.5.0) : id (pay_…),
// status, metadata, checkout_configuration_id, account_id (company_id / company.id dans les
// formes plus anciennes), paid_at, et trois montants :
//   - presentment_total : montant présenté au client, dans la devise du plan (celle de la
//     facture), avant conversion. C'est lui qui est comparé au lien ;
//   - total, amount_after_fees : dans la devise de RÈGLEMENT (currency). Elle diffère de la
//     facture quand le compte connecté règle ses ventes dans une autre devise
//     (preferred_settlement_currency) : une facture de 120,50 € réglée en dollars arrive
//     avec currency « usd » et total ≈ 131 $.
// Commission Whop (fee) = total − amount_after_fees, seulement si la devise de règlement est
// celle du montant présenté (sinon les deux ne se soustraient pas) ; 0 dans le cas contraire.
export function parseWhopPayment(event: unknown): WhopPayment | null {
  const envelope = obj(event);
  if (envelope?.type !== "payment.succeeded") return null;
  const data = obj(envelope.data);
  const providerReference = str(data?.id);
  if (!data || !providerReference) return null;
  if (data.status !== undefined && data.status !== "paid") return null;

  const settlementCurrency = str(data.currency)?.toUpperCase() ?? null;
  const presentment = obj(data.presentment_total);
  const presentmentCurrency = str(presentment?.currency)?.toUpperCase() ?? null;
  // Montant présenté lisible : il fait foi ; sinon (forme ancienne) total et currency.
  const usePresentment = presentment !== null && presentmentCurrency !== null;
  const currency = usePresentment ? presentmentCurrency : settlementCurrency;
  const amount = moneyToMinor(usePresentment ? presentment : data.total);
  const settledTotal = moneyToMinor(data.total);
  const net = moneyToMinor(data.amount_after_fees);
  const sameCurrency = settlementCurrency !== null && settlementCurrency === currency;
  return {
    providerReference,
    merchantReference: str(obj(data.metadata)?.ivonea_reference),
    checkoutId: str(data.checkout_configuration_id),
    accountId: str(data.account_id) ?? str(obj(data.company)?.id) ?? str(obj(data.account)?.id),
    currency: (WHOP_CURRENCIES as readonly string[]).includes(currency ?? "") ? (currency as WhopCurrency) : null,
    amount,
    fee: sameCurrency && settledTotal !== null && net !== null && net <= settledTotal ? settledTotal - net : 0,
    paidAt: str(data.paid_at),
  };
}
