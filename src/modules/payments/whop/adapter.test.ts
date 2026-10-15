import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applicationFee,
  createConnectedAccount,
  createOnboardingLink,
  deleteCheckoutConfiguration,
  getAccountStatus,
  moneyToMinor,
  parseWhopPayment,
  platformFeePercent,
  verifyWhopSignature,
  whop,
  WHOP_API_VERSION_DATE,
  WHOP_DEFAULT_BASE_URL,
} from "./adapter";

const SECRET = "ws_test_secret_0123456789abcdef";
const BODY = Buffer.from('{"type":"payment.succeeded","data":{"id":"pay_1"}}');

function sign(body: Buffer, id: string, t: number, secret = SECRET) {
  return `v1,${createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${t}.`).update(body).digest("base64")}`;
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const linkInput = {
  amount: 12050,
  reference: "IVW-inv-1",
  clientName: "Client",
  description: "Facture F-2026-0001 · Studio",
  successUrl: "https://app.test/fr/p/tok?paiement=ok",
  failureUrl: "https://app.test/fr/p/tok?paiement=echec",
  notificationUrl: "https://app.test/api/whop/webhook",
  validDurationHours: 0,
  currency: "EUR",
  accountId: "biz_child",
  applicationFee: 603,
};

describe("signature Standard Webhooks", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  const t = Math.floor(now.getTime() / 1000);

  it("valide une signature récente, parmi plusieurs (rotation du secret)", () => {
    const headers = { id: "msg_1", timestamp: String(t - 299), signature: `v1,AAAA ${sign(BODY, "msg_1", t - 299)}` };
    expect(verifyWhopSignature(BODY, headers, SECRET, { now })).toBe(true);
  });

  it("refuse une signature trop ancienne, un corps modifié, un autre secret, un en-tête absent", () => {
    const old = { id: "msg_1", timestamp: String(t - 301), signature: sign(BODY, "msg_1", t - 301) };
    expect(verifyWhopSignature(BODY, old, SECRET, { now })).toBe(false);
    const ok = { id: "msg_1", timestamp: String(t), signature: sign(BODY, "msg_1", t) };
    expect(verifyWhopSignature(Buffer.from(`${BODY} `), ok, SECRET, { now })).toBe(false);
    expect(verifyWhopSignature(BODY, ok, "ws_other", { now })).toBe(false);
    expect(verifyWhopSignature(BODY, { ...ok, id: "msg_2" }, SECRET, { now })).toBe(false);
    expect(verifyWhopSignature(BODY, { ...ok, signature: null }, SECRET, { now })).toBe(false);
    expect(verifyWhopSignature(BODY, { ...ok, signature: ok.signature.replace("v1,", "v2,") }, SECRET, { now })).toBe(false);
    expect(verifyWhopSignature(BODY, ok, "", { now })).toBe(false);
  });
});

describe("montants", () => {
  it("lit la forme Money, une chaîne ou un nombre, refuse plus fin que le centime", () => {
    expect(moneyToMinor({ amount: "10.50", decimals: 2 })).toBe(1050);
    expect(moneyToMinor("120")).toBe(12000);
    expect(moneyToMinor("120.5")).toBe(12050);
    expect(moneyToMinor(10.5)).toBe(1050);
    expect(moneyToMinor(0.1 + 0.2)).toBe(30);
    expect(moneyToMinor("10.555")).toBeNull();
    expect(moneyToMinor(10.555)).toBeNull();
    expect(moneyToMinor(-1)).toBeNull();
    expect(moneyToMinor(null)).toBeNull();
  });

  it("commission : pourcentage arrondi, positive et inférieure au montant", () => {
    expect(applicationFee(12050, 5)).toBe(603);
    expect(applicationFee(12050, 0)).toBe(0);
    expect(applicationFee(1, 10)).toBe(0);
    vi.stubEnv("WHOP_PLATFORM_FEE_PERCENT", "2.5");
    expect(platformFeePercent()).toBe(2.5);
    vi.stubEnv("WHOP_PLATFORM_FEE_PERCENT", "abc");
    expect(platformFeePercent()).toBe(0);
    vi.stubEnv("WHOP_PLATFORM_FEE_PERCENT", "150");
    expect(platformFeePercent()).toBe(0);
  });
});

describe("API Whop (fetch simulé)", () => {
  it("crée un paiement unique sur le compte connecté, commission et métadonnées comprises", async () => {
    const fetchMock = mockFetch(200, {
      id: "ch_123",
      purchase_url: "/checkout/ch_123/",
      plan: { currency: "eur", initial_price: 120.5, adaptive_pricing_enabled: false, application_fee_amount: 6.03 },
    });
    const result = await whop.createLink("key", linkInput);
    expect(result).toEqual({ ok: true, value: { url: "https://whop.com/checkout/ch_123/", notificationToken: "ch_123", expiresAt: null } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WHOP_DEFAULT_BASE_URL}/checkout_configurations`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer key",
      "Api-Version-Date": WHOP_API_VERSION_DATE,
      "Idempotency-Key": "IVW-inv-1",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      account_id: "biz_child",
      mode: "payment",
      plan: {
        account_id: "biz_child",
        company_id: "biz_child",
        plan_type: "one_time",
        initial_price: 120.5,
        currency: "eur",
        adaptive_pricing_enabled: false,
        title: linkInput.description,
        application_fee_amount: 6.03,
      },
      metadata: { ivonea_reference: "IVW-inv-1" },
      redirect_url: linkInput.successUrl,
    });
  });

  it("sans commission : pas de application_fee_amount ; URL de base configurable", async () => {
    vi.stubEnv("WHOP_API_BASE_URL", "http://127.0.0.1:3299/api/v1/");
    const fetchMock = mockFetch(201, { id: "ch_1", purchase_url: "https://whop.com/checkout/ch_1/" });
    await whop.createLink("key", { ...linkInput, applicationFee: 0 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3299/api/v1/checkout_configurations");
    expect(JSON.parse(init.body as string).plan).not.toHaveProperty("application_fee_amount");
  });

  it("traduit les erreurs HTTP et les réponses illisibles", async () => {
    for (const [status, error] of [
      [401, "unauthorized"],
      [403, "unauthorized"],
      [404, "not_found"],
      [409, "conflict"],
      [422, "rejected"],
      [429, "unavailable"],
      [502, "unavailable"],
    ] as const) {
      mockFetch(status, { error: { message: "x" } });
      expect(await whop.createLink("key", linkInput)).toMatchObject({ ok: false, error });
    }
    mockFetch(200, { id: "ch_1", purchase_url: "http://insecure.test/x" });
    expect(await whop.createLink("key", linkInput)).toMatchObject({ ok: false, error: "unavailable" });
    const free = { ...linkInput, applicationFee: 0 };
    // Plan renvoyé différent de la demande : lien refusé (le paiement ne serait pas reconnu).
    for (const plan of [
      { currency: "usd", initial_price: 120.5 },
      { currency: "eur", initial_price: 118 },
      { currency: "eur", initial_price: 120.5, adaptive_pricing_enabled: true },
    ]) {
      mockFetch(200, { id: "ch_1", purchase_url: "/checkout/ch_1/", plan });
      expect(await whop.createLink("key", free)).toMatchObject({ ok: false, error: "rejected", message: "plan_mismatch" });
    }
    const echoed = { currency: "eur", initial_price: 120.5, adaptive_pricing_enabled: false };
    mockFetch(200, { id: "ch_1", purchase_url: "/checkout/ch_1/", plan: echoed });
    expect(await whop.createLink("key", free)).toMatchObject({ ok: true });
    // Commission demandée mais absente ou différente dans la réponse : rien ne prouve que
    // Whop la prélève, lien refusé.
    for (const response of [
      { id: "ch_1", purchase_url: "/checkout/ch_1/" },
      { id: "ch_1", purchase_url: "/checkout/ch_1/", plan: echoed },
      { id: "ch_1", purchase_url: "/checkout/ch_1/", plan: { ...echoed, application_fee_amount: 6 } },
    ]) {
      mockFetch(200, response);
      expect(await whop.createLink("key", linkInput)).toMatchObject({ ok: false, error: "rejected", message: "plan_mismatch" });
    }
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await whop.createLink("key", linkInput)).toEqual({ ok: false, error: "unavailable" });
    expect(await whop.createLink("key", { ...linkInput, accountId: undefined })).toMatchObject({ ok: false, error: "rejected" });
  });

  it("retire une configuration de paiement ; déjà supprimée (404) : même résultat", async () => {
    const fetchMock = mockFetch(200, { id: "ch_123", deleted: true });
    expect(await deleteCheckoutConfiguration("key", "ch_123")).toEqual({ ok: true, value: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${WHOP_DEFAULT_BASE_URL}/checkout_configurations/ch_123`);
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
    mockFetch(404, { error: { message: "Not found" } });
    expect(await deleteCheckoutConfiguration("key", "ch_123")).toEqual({ ok: true, value: null });
    mockFetch(500, {});
    expect(await deleteCheckoutConfiguration("key", "ch_123")).toMatchObject({ ok: false, error: "unavailable" });
  });

  it("compte connecté, lien d'inscription et capacité carte", async () => {
    let fetchMock = mockFetch(200, { id: "biz_child" });
    expect(await createConnectedAccount("key", { email: "a@b.mg", title: "Studio", externalId: "ws-1" })).toEqual({
      ok: true,
      value: { id: "biz_child" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ email: "a@b.mg", title: "Studio", metadata: { external_id: "ws-1" } });

    fetchMock = mockFetch(200, { url: "https://whop.com/onboarding/x", expires_at: "2026-10-15T11:00:00Z" });
    expect(await createOnboardingLink("key", { accountId: "biz_child", returnUrl: "https://a/r", refreshUrl: "https://a/f" })).toEqual({
      ok: true,
      value: { url: "https://whop.com/onboarding/x" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      account_id: "biz_child",
      refresh_url: "https://a/f",
      return_url: "https://a/r",
      use_case: "account_onboarding",
    });

    fetchMock = mockFetch(200, { id: "biz_child", capabilities: { accept_card_payments: "active" } });
    expect(await getAccountStatus("key", "biz_child")).toEqual({ ok: true, value: { canAcceptCards: true } });
    expect(fetchMock.mock.calls[0][0]).toBe(`${WHOP_DEFAULT_BASE_URL}/accounts/biz_child`);
    mockFetch(200, { id: "biz_child", capabilities: { accept_card_payments: "pending" } });
    expect(await getAccountStatus("key", "biz_child")).toEqual({ ok: true, value: { canAcceptCards: false } });
  });
});

describe("événement payment.succeeded", () => {
  const event = {
    type: "payment.succeeded",
    id: "evt_1",
    account_id: "biz_child",
    data: {
      id: "pay_1",
      status: "paid",
      total: { amount: "120.50", decimals: 2 },
      amount_after_fees: { amount: "115.20", decimals: 2 },
      currency: "eur",
      metadata: { ivonea_reference: "IVW-inv-1" },
      checkout_configuration_id: "ch_123",
      account_id: "biz_child",
      paid_at: "2026-10-15T09:59:00Z",
    },
  };

  it("lit référence, montant, frais, devise et compte", () => {
    expect(parseWhopPayment(event)).toEqual({
      providerReference: "pay_1",
      merchantReference: "IVW-inv-1",
      checkoutId: "ch_123",
      accountId: "biz_child",
      currency: "EUR",
      amount: 12050,
      fee: 530,
      paidAt: "2026-10-15T09:59:00Z",
    });
  });

  it("montant présenté au client (presentment_total) : fait foi, même réglé dans la même devise", () => {
    const parsed = parseWhopPayment({
      ...event,
      data: { ...event.data, presentment_total: { amount: "120.50", currency: "eur", decimals: 2 } },
    });
    expect(parsed).toMatchObject({ currency: "EUR", amount: 12050, fee: 530 });
  });

  it("compte réglé dans une autre devise (preferred_settlement_currency) : facture en euros lue en euros, commission 0", () => {
    const parsed = parseWhopPayment({
      ...event,
      data: {
        ...event.data,
        presentment_total: { amount: "120.50", currency: "eur", decimals: 2 },
        total: { amount: "131.20", currency: "usd", decimals: 2 },
        amount_after_fees: { amount: "125.10", currency: "usd", decimals: 2 },
        currency: "usd",
      },
    });
    expect(parsed).toMatchObject({ currency: "EUR", amount: 12050, fee: 0, merchantReference: "IVW-inv-1" });
  });

  it("montant présenté dans une autre devise que la facture : lu tel quel (refusé ensuite par la base)", () => {
    const parsed = parseWhopPayment({
      ...event,
      data: { ...event.data, presentment_total: { amount: "131.20", currency: "usd", decimals: 2 } },
    });
    expect(parsed).toMatchObject({ currency: "USD", amount: 13120, fee: 0 });
  });

  it("ignore les autres événements et les paiements non encaissés ; devise hors EUR/USD → null", () => {
    expect(parseWhopPayment({ ...event, type: "payment.failed" })).toBeNull();
    expect(parseWhopPayment({ ...event, data: { ...event.data, status: "open" } })).toBeNull();
    expect(parseWhopPayment({ ...event, data: { ...event.data, id: undefined } })).toBeNull();
    expect(parseWhopPayment("x")).toBeNull();
    expect(parseWhopPayment({ ...event, data: { ...event.data, currency: "gbp" } })?.currency).toBeNull();
  });
});
