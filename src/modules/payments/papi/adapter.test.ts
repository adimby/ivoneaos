import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { papi, PAPI_DEFAULT_BASE_URL, verifyPapiSignature } from "./adapter";

// Vecteur de test de la doc Papi (« Tester votre implémentation »).
const DOC_SECRET = "pwhsec_5f1c2b7e9a0d4c3b8e6f1a2d9c7b4e0f3a6d8c1b5e9f2a7d4c0b3e6f9a1d8c2b";
const DOC_BODY = Buffer.from('{"paymentReference":"PAPI-TEST-0001","paymentStatus":"SUCCESS","amount":150000}');
const DOC_HEADER = "t=1757750400,v1=66c446f11f07c733a8ded2580681d7e0430cc490637479178506fd2a66595d53";

function sign(body: Buffer, secret: string, t: number) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.`).update(body).digest("hex")}`;
}

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("signature X-Papi-Signature", () => {
  it("valide le vecteur de test de la doc (contrôle des 300 s désactivé)", () => {
    expect(verifyPapiSignature(DOC_BODY, DOC_HEADER, DOC_SECRET, { toleranceSeconds: 0 })).toBe(true);
  });

  it("valide une signature récente, refuse une signature trop ancienne", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    const t = Math.floor(now.getTime() / 1000);
    expect(verifyPapiSignature(DOC_BODY, sign(DOC_BODY, DOC_SECRET, t - 299), DOC_SECRET, { now })).toBe(true);
    expect(verifyPapiSignature(DOC_BODY, sign(DOC_BODY, DOC_SECRET, t - 301), DOC_SECRET, { now })).toBe(false);
    // Le vecteur de la doc est daté de 2025 : refusé avec la tolérance par défaut.
    expect(verifyPapiSignature(DOC_BODY, DOC_HEADER, DOC_SECRET, { now })).toBe(false);
  });

  it("refuse signature invalide, corps modifié, autre secret, en-tête absent ou mal formé", () => {
    const opts = { toleranceSeconds: 0 };
    expect(verifyPapiSignature(DOC_BODY, DOC_HEADER.replace(/.$/, "4"), DOC_SECRET, opts)).toBe(false);
    expect(verifyPapiSignature(Buffer.from(DOC_BODY.toString().replace("150000", "150001")), DOC_HEADER, DOC_SECRET, opts)).toBe(false);
    expect(verifyPapiSignature(DOC_BODY, DOC_HEADER, DOC_SECRET.replace("pwhsec_", ""), opts)).toBe(false);
    expect(verifyPapiSignature(DOC_BODY, null, DOC_SECRET, opts)).toBe(false);
    expect(verifyPapiSignature(DOC_BODY, "", DOC_SECRET, opts)).toBe(false);
    expect(verifyPapiSignature(DOC_BODY, "v1=66c4", DOC_SECRET, opts)).toBe(false);
    expect(verifyPapiSignature(DOC_BODY, "t=abc,v1=" + "0".repeat(64), DOC_SECRET, opts)).toBe(false);
    expect(verifyPapiSignature(DOC_BODY, DOC_HEADER.toUpperCase(), DOC_SECRET, opts)).toBe(false);
  });

  it("verifyNotification lit le corps une fois la signature valide", () => {
    const now = new Date();
    const body = Buffer.from(
      JSON.stringify({
        paymentStatus: "SUCCESS",
        paymentMethod: "ORANGE_MONEY",
        amount: 450000,
        fee: 4500,
        merchantPaymentReference: "IVN-x-1",
        paymentReference: "c1f4a5b0-6f5e-4e1b-9f0e-2b7d8a9c3d21",
        notificationToken: "tok",
      }),
    );
    const header = sign(body, DOC_SECRET, Math.floor(now.getTime() / 1000));
    expect(papi.verifyNotification(body, header, DOC_SECRET, now)).toEqual({
      merchantReference: "IVN-x-1",
      providerReference: "c1f4a5b0-6f5e-4e1b-9f0e-2b7d8a9c3d21",
      status: "SUCCESS",
      amount: 450000,
      fee: 4500,
      method: "ORANGE_MONEY",
      notificationToken: "tok",
    });
    expect(papi.verifyNotification(body, header, "pwhsec_" + "0".repeat(64), now)).toBeNull();
  });
});

describe("création d'un lien (POST /payment-links)", () => {
  const input = {
    amount: 450000,
    reference: "IVN-abc-1",
    clientName: "Rakoto Jean",
    description: "Facture F-2026-0001 · Studio",
    successUrl: "https://app.test/fr/p/tok?paiement=ok",
    failureUrl: "https://app.test/fr/p/tok?paiement=echec",
    notificationUrl: "https://app.test/api/papi/notification",
    validDurationHours: 168,
  };

  it("envoie les champs et l'en-tête Token de la doc, lit paymentLink et notificationToken", async () => {
    const fetchMock = mockFetch(200, {
      data: {
        amount: 450000.0,
        currency: "MGA",
        linkCreationDateTime: 1788065989011,
        linkExpirationDateTime: 1788281989011,
        paymentLink: "https://payment-form.papi.mg/shop/payments/jwt",
        paymentReference: "IVN-abc-1",
        notificationToken: "5b8f0c3e",
        shortLink: null,
      },
    });
    const result = await papi.createLink("cle-api", input);
    expect(result).toEqual({
      ok: true,
      value: { url: "https://payment-form.papi.mg/shop/payments/jwt", notificationToken: "5b8f0c3e", expiresAt: new Date(1788281989011) },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PAPI_DEFAULT_BASE_URL}/payment-links`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Token: "cle-api", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      amount: 450000,
      reference: "IVN-abc-1",
      clientName: "Rakoto Jean",
      description: "Facture F-2026-0001 · Studio",
      successUrl: input.successUrl,
      failureUrl: input.failureUrl,
      notificationUrl: input.notificationUrl,
      validDuration: 168,
    });
  });

  it("URL de base configurable (serveur simulé des tests)", async () => {
    vi.stubEnv("PAPI_API_BASE_URL", "http://127.0.0.1:3199/");
    const fetchMock = mockFetch(404, { error: { code: "CORE_404", message: "Aucun lien" } });
    await papi.getLinkStatus("cle", "IVN-1");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("http://127.0.0.1:3199/payment-links/IVN-1");
  });

  it("traduit les erreurs : clé invalide (400), conflit (409), validation, Papi injoignable", async () => {
    mockFetch(400, { error: { code: "CORE_INPUT_400", message: "API key invalide" } });
    expect(await papi.createLink("x", input)).toMatchObject({ ok: false, error: "unauthorized" });
    mockFetch(409, { error: { code: "PAYMENT_LINK_CONFLICT", message: "Un lien de paiement actif existe déjà" } });
    expect(await papi.createLink("x", input)).toMatchObject({ ok: false, error: "conflict" });
    mockFetch(400, { error: { code: "CORE_INPUT_400", message: "Le montant doit être supérieur ou égal à 300." } });
    expect(await papi.createLink("x", input)).toMatchObject({ ok: false, error: "rejected" });
    mockFetch(503, {});
    expect(await papi.createLink("x", input)).toMatchObject({ ok: false, error: "unavailable" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    expect(await papi.createLink("x", input)).toEqual({ ok: false, error: "unavailable" });
    // Réponse 200 sans lien https : inutilisable.
    mockFetch(200, { data: { paymentLink: "http://insecure" } });
    expect(await papi.createLink("x", input)).toMatchObject({ ok: false, error: "unavailable" });
  });
});

describe("relecture d'un lien (GET /payment-links/{reference})", () => {
  it("lit linkStatus, paymentStatus, papiPaymentReference ; BRED = carte", async () => {
    const fetchMock = mockFetch(200, {
      data: {
        linkStatus: "PAID",
        paymentStatus: "SUCCESS",
        paymentMethod: "BRED",
        currency: "MGA",
        amount: 15000.0,
        merchantPaymentReference: "IVN-a/b",
        papiPaymentReference: "c1f4",
        notificationToken: "tok",
      },
    });
    expect(await papi.getLinkStatus("cle", "IVN-a/b")).toEqual({
      ok: true,
      value: { linkStatus: "PAID", paymentStatus: "SUCCESS", method: "CARD", amount: 15000, providerReference: "c1f4", notificationToken: "tok" },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PAPI_DEFAULT_BASE_URL}/payment-links/IVN-a%2Fb`);
    expect(init.headers).toMatchObject({ Token: "cle" });
  });

  it("lien jamais payé : statuts null", async () => {
    mockFetch(200, { data: { linkStatus: "EXPIRED", paymentStatus: null, paymentMethod: null, amount: 300, papiPaymentReference: null } });
    expect(await papi.getLinkStatus("cle", "r")).toMatchObject({
      ok: true,
      value: { linkStatus: "EXPIRED", paymentStatus: null, method: null, providerReference: null },
    });
  });
});

describe("vérification de la clé (référence inexistante)", () => {
  it("401 = clé inconnue, 404 = clé valide, autre = Papi indisponible", async () => {
    const fetchMock = mockFetch(401, { error: { code: "CORE_PERM_0001", message: "API key invalide" } });
    expect(await papi.verifyCredentials("mauvaise")).toBe("invalid");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toMatch(/\/payment-links\/IVN-CHECK-[0-9a-f-]{36}$/);
    mockFetch(404, { error: { code: "CORE_404", message: "Aucun lien de paiement" } });
    expect(await papi.verifyCredentials("bonne")).toBe("valid");
    mockFetch(500, {});
    expect(await papi.verifyCredentials("bonne")).toBe("unavailable");
  });
});
