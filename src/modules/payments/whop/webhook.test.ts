import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleWhopWebhook, type WhopWebhookStore } from "./webhook";

const SECRET = "ws_test_secret_0123456789abcdef";
const now = new Date("2026-10-15T10:00:00Z");
const t = String(Math.floor(now.getTime() / 1000));

function signed(payload: unknown, id = "msg_1") {
  const rawBody = Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
  const signature = `v1,${createHmac("sha256", Buffer.from(SECRET, "utf8")).update(`${id}.${t}.`).update(rawBody).digest("base64")}`;
  return { rawBody, headers: { id, timestamp: t, signature } };
}

function store(result: Awaited<ReturnType<WhopWebhookStore["recordPayment"]>> = "recorded") {
  return {
    saveEvent: vi.fn(async () => "evt-row"),
    recordPayment: vi.fn(async () => result),
    flagLink: vi.fn(async () => true),
    finishEvent: vi.fn(async () => undefined),
  } satisfies WhopWebhookStore;
}

const payment = {
  type: "payment.succeeded",
  data: {
    id: "pay_1",
    status: "paid",
    total: 120.5,
    amount_after_fees: 115.2,
    currency: "usd",
    metadata: { ivonea_reference: "IVW-inv-1" },
    checkout_configuration_id: "ch_1",
    account_id: "biz_child",
    paid_at: null,
  },
};

afterEach(() => vi.restoreAllMocks());

describe("webhook Whop", () => {
  it("signature invalide : 401, rien n'est enregistré", async () => {
    const s = store();
    const { rawBody, headers } = signed(payment);
    const res = await handleWhopWebhook({ rawBody, headers: { ...headers, signature: "v1,AAAA" }, secret: SECRET, store: s, now });
    expect(res.status).toBe(401);
    expect(s.saveEvent).not.toHaveBeenCalled();
  });

  it("signature trop ancienne : 401", async () => {
    const s = store();
    const { rawBody, headers } = signed(payment);
    const later = new Date(now.getTime() + 301_000);
    expect((await handleWhopWebhook({ rawBody, headers, secret: SECRET, store: s, now: later })).status).toBe(401);
  });

  it("paiement réussi : enregistré via record_whop_payment, 200", async () => {
    const s = store("recorded");
    const res = await handleWhopWebhook({ ...signed(payment), secret: SECRET, store: s, now });
    expect(res).toEqual({ status: 200, body: { received: true, result: "recorded" } });
    expect(s.recordPayment).toHaveBeenCalledWith({
      merchantReference: "IVW-inv-1",
      checkoutId: "ch_1",
      accountId: "biz_child",
      providerReference: "pay_1",
      amount: 12050,
      currency: "USD",
      fee: 530,
      paidAt: null,
    });
    expect(s.finishEvent).toHaveBeenCalledWith("evt-row", { error: null });
  });

  it("anomalie (montant différent) : 200, erreur notée sur l'événement", async () => {
    const s = store("amount_mismatch");
    const res = await handleWhopWebhook({ ...signed(payment), secret: SECRET, store: s, now });
    expect(res.body.result).toBe("amount_mismatch");
    expect(s.finishEvent).toHaveBeenCalledWith("evt-row", { error: "amount_mismatch" });
  });

  it("autre événement : ignoré ; corps illisible : 400 ; devise inconnue : erreur notée", async () => {
    let s = store();
    expect((await handleWhopWebhook({ ...signed({ type: "membership.activated", data: {} }), secret: SECRET, store: s, now })).body.result).toBe(
      "ignored",
    );
    expect(s.recordPayment).not.toHaveBeenCalled();

    s = store();
    expect((await handleWhopWebhook({ ...signed("{not json"), secret: SECRET, store: s, now })).status).toBe(400);

    s = store();
    const gbp = { ...payment, data: { ...payment.data, currency: "gbp" } };
    const res = await handleWhopWebhook({ ...signed(gbp), secret: SECRET, store: s, now });
    expect(res.body.result).toBe("currency_mismatch");
    expect(s.recordPayment).not.toHaveBeenCalled();
  });

  it("paiement débité mais non enregistrable : anomalie notée sur le lien retrouvé", async () => {
    let s = store();
    const gbp = { ...payment, data: { ...payment.data, currency: "gbp" } };
    await handleWhopWebhook({ ...signed(gbp), secret: SECRET, store: s, now });
    expect(s.flagLink).toHaveBeenCalledWith({ merchantReference: "IVW-inv-1", checkoutId: "ch_1" }, "currency_mismatch");
    expect(s.finishEvent).toHaveBeenCalledWith("evt-row", { error: "currency_mismatch" });

    s = store();
    const unreadable = { ...payment, data: { ...payment.data, total: "abc" } };
    expect((await handleWhopWebhook({ ...signed(unreadable), secret: SECRET, store: s, now })).body.result).toBe("incomplete_payment");
    expect(s.flagLink).toHaveBeenCalledWith({ merchantReference: "IVW-inv-1", checkoutId: "ch_1" }, "incomplete_payment");

    for (const result of ["account_mismatch", "unknown_link"] as const) {
      s = store(result);
      expect((await handleWhopWebhook({ ...signed(payment), secret: SECRET, store: s, now })).body.result).toBe(result);
      expect(s.flagLink).toHaveBeenCalledWith({ merchantReference: "IVW-inv-1", checkoutId: "ch_1" }, result);
      expect(s.finishEvent).toHaveBeenCalledWith("evt-row", { error: result });
    }

    // Montant différent : déjà noté par record_whop_payment.
    s = store("amount_mismatch");
    await handleWhopWebhook({ ...signed(payment), secret: SECRET, store: s, now });
    expect(s.flagLink).not.toHaveBeenCalled();
  });

  it("aucun lien retrouvé : erreur journalisée côté serveur", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let s = store("unknown_link");
    s.flagLink.mockResolvedValueOnce(false);
    await handleWhopWebhook({ ...signed(payment), secret: SECRET, store: s, now });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pay_1 non enregistré (unknown_link)"));

    log.mockClear();
    s = store();
    const anonymous = { ...payment, data: { ...payment.data, metadata: {}, checkout_configuration_id: null } };
    expect((await handleWhopWebhook({ ...signed(anonymous), secret: SECRET, store: s, now })).body.result).toBe("unknown_link");
    expect(s.flagLink).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("sans référence"));
  });

  it("base indisponible : l'erreur remonte (la route répond 503), événement marqué", async () => {
    const s = store();
    s.recordPayment.mockRejectedValueOnce(new Error("db down"));
    await expect(handleWhopWebhook({ ...signed(payment), secret: SECRET, store: s, now })).rejects.toThrow("db down");
    expect(s.finishEvent).toHaveBeenCalledWith("evt-row", { error: "record_failed" });
  });
});
