import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { papi } from "./adapter";
import { handlePapiNotification, type NotificationStore, type RecordResult } from "./notification";

const SECRET = "pwhsec_" + "ab".repeat(32);
const NOW = new Date("2026-10-15T10:00:00Z");

function signed(body: object, secret = SECRET, t = Math.floor(NOW.getTime() / 1000)) {
  const raw = Buffer.from(JSON.stringify(body));
  return { raw, signature: `t=${t},v1=${createHmac("sha256", secret).update(`${t}.`).update(raw).digest("hex")}` };
}

// Base simulée : liens, paiements (uniques par référence Papi), événements.
function fakeStore({ accepting = true, secrets = [SECRET] }: { accepting?: boolean; secrets?: string[] } = {}) {
  const log: string[] = [];
  const events = new Map<string, { raw: string; signatureValid: boolean | null; error: string | null; processed: boolean }>();
  const payments = new Map<string, { amount: number; merchantReference: string }>();
  const links = new Map([["IVN-inv-1", { notificationToken: "tok-1", signingSecrets: secrets, amount: 450000, payable: true }]]);
  const store: NotificationStore = {
    async acceptingEvents() {
      return accepting;
    },
    async saveEvent(raw) {
      log.push("save");
      const id = `e${events.size + 1}`;
      events.set(id, { raw, signatureValid: null, error: null, processed: false });
      return id;
    },
    async findLink(reference) {
      log.push("find");
      const link = links.get(reference);
      return link ? { notificationToken: link.notificationToken, signingSecrets: link.signingSecrets } : null;
    },
    async recordPayment(input): Promise<RecordResult> {
      log.push("record");
      const link = links.get(input.merchantReference);
      if (!link) return "unknown_link";
      if (payments.has(input.providerReference)) return "duplicate";
      if (input.amount !== link.amount) return "amount_mismatch";
      if (!link.payable) return "not_payable";
      payments.set(input.providerReference, { amount: input.amount, merchantReference: input.merchantReference });
      return "recorded";
    },
    async finishEvent(id, result) {
      Object.assign(events.get(id)!, result, { processed: true });
    },
  };
  return { store, log, events, payments, links };
}

const success = {
  paymentStatus: "SUCCESS",
  paymentMethod: "MVOLA",
  currency: "MGA",
  amount: 450000,
  fee: 4500,
  merchantPaymentReference: "IVN-inv-1",
  paymentReference: "c1f4a5b0-6f5e-4e1b-9f0e-2b7d8a9c3d21",
  notificationToken: "tok-1",
};

const run = (store: NotificationStore, raw: Buffer, signature: string | null) =>
  handlePapiNotification({ rawBody: raw, signature, store, provider: papi, now: NOW });

describe("notification Papi", () => {
  it("enregistre le corps brut d'abord, vérifie, puis enregistre le paiement", async () => {
    const { store, log, events, payments } = fakeStore();
    const { raw, signature } = signed(success);
    expect(await run(store, raw, signature)).toEqual({ status: 200, body: { received: true, result: "recorded" } });
    expect(log).toEqual(["save", "find", "record"]);
    expect(events.get("e1")).toEqual({ raw: raw.toString(), signatureValid: true, error: null, processed: true });
    expect(payments.get(success.paymentReference)).toEqual({ amount: 450000, merchantReference: "IVN-inv-1" });
  });

  it("idempotente : une notification rejouée (nouvelle signature) ne paie pas deux fois", async () => {
    const { store, payments } = fakeStore();
    const first = signed(success);
    await run(store, first.raw, first.signature);
    const replay = signed(success, SECRET, Math.floor(NOW.getTime() / 1000) + 5);
    expect(await run(store, replay.raw, replay.signature)).toEqual({ status: 200, body: { received: true, result: "duplicate" } });
    expect(payments.size).toBe(1);
  });

  it("signature invalide ou absente : 401, événement conservé, rien de payé", async () => {
    const { store, events, payments, log } = fakeStore();
    const { raw } = signed(success);
    const forged = signed(success, "pwhsec_" + "00".repeat(32));
    expect((await run(store, raw, forged.signature)).status).toBe(401);
    expect((await run(store, raw, null)).status).toBe(401);
    expect(events.get("e1")).toMatchObject({ signatureValid: false, error: "invalid_signature", processed: true });
    expect(events.get("e2")).toMatchObject({ signatureValid: false, error: "invalid_signature" });
    expect(payments.size).toBe(0);
    expect(log).not.toContain("record");
  });

  it("corps modifié après signature : refusé", async () => {
    const { store, payments } = fakeStore();
    const { signature } = signed(success);
    const tampered = Buffer.from(JSON.stringify({ ...success, amount: 1 }));
    expect((await run(store, tampered, signature)).status).toBe(401);
    expect(payments.size).toBe(0);
  });

  it("notificationToken différent du lien : 401", async () => {
    const { store, events, payments } = fakeStore();
    const { raw, signature } = signed({ ...success, notificationToken: "autre" });
    expect(await run(store, raw, signature)).toMatchObject({ status: 401, body: { error: "token_mismatch" } });
    expect(events.get("e1")).toMatchObject({ signatureValid: true, error: "token_mismatch" });
    expect(payments.size).toBe(0);
  });

  it("référence inconnue ou corps illisible : refusés, corps conservé", async () => {
    const { store, events } = fakeStore();
    const unknown = signed({ ...success, merchantPaymentReference: "IVN-autre-1" });
    expect((await run(store, unknown.raw, unknown.signature)).status).toBe(401);
    expect((await run(store, Buffer.from("pas du json"), null)).status).toBe(400);
    expect(events.get("e2")).toMatchObject({ raw: "pas du json", error: "invalid_body" });
  });

  it("paiement échoué : rien n'est enregistré, 200", async () => {
    const { store, log } = fakeStore();
    const { raw, signature } = signed({ ...success, paymentStatus: "FAILED" });
    expect(await run(store, raw, signature)).toEqual({ status: 200, body: { received: true, result: "FAILED" } });
    expect(log).not.toContain("record");
  });

  it("montant différent du lien : rien de payé, erreur gardée pour examen", async () => {
    const { store, events, payments } = fakeStore();
    const { raw, signature } = signed({ ...success, amount: 300 });
    expect(await run(store, raw, signature)).toEqual({ status: 200, body: { received: true, result: "amount_mismatch" } });
    expect(events.get("e1")).toMatchObject({ error: "amount_mismatch" });
    expect(payments.size).toBe(0);
  });

  it("afflux de notifications non authentiques : les fausses refusées sans trace, la vraie traitée", async () => {
    const { store, events, log, payments } = fakeStore({ accepting: false });
    const forged = signed(success, "pwhsec_" + "00".repeat(32));
    expect(await run(store, forged.raw, forged.signature)).toMatchObject({ status: 401, body: { error: "invalid_signature" } });
    expect((await run(store, Buffer.from("pas du json"), null)).status).toBe(400);
    expect(events.size).toBe(0);
    // Signature vérifiée d'abord, puis corps enregistré et paiement traité.
    const { raw, signature } = signed(success);
    expect(await run(store, raw, signature)).toEqual({ status: 200, body: { received: true, result: "recorded" } });
    expect(log).toEqual(["find", "find", "save", "record"]);
    expect([...events.values()]).toEqual([{ raw: raw.toString(), signatureValid: true, error: null, processed: true }]);
    expect(payments.size).toBe(1);
  });

  it("clé remplacée : la notification d'un ancien lien est vérifiée avec le secret gardé sur le lien", async () => {
    const OLD = "pwhsec_" + "cd".repeat(32);
    const { store, payments } = fakeStore({ secrets: [OLD, SECRET] });
    const old = signed(success, OLD);
    expect(await run(store, old.raw, old.signature)).toEqual({ status: 200, body: { received: true, result: "recorded" } });
    expect(payments.size).toBe(1);
  });

  it("lien sans secret (expiré depuis longtemps, secret effacé) : 401", async () => {
    const { store, events } = fakeStore({ secrets: [] });
    const { raw, signature } = signed(success);
    expect(await run(store, raw, signature)).toMatchObject({ status: 401, body: { error: "no_signing_secret" } });
    expect(events.get("e1")).toMatchObject({ error: "no_signing_secret", processed: true });
  });

  it("paiement refusé par la facture : 200 (pas de renvoi sans fin), anomalie gardée", async () => {
    const { store, events, links } = fakeStore();
    links.get("IVN-inv-1")!.payable = false;
    const { raw, signature } = signed(success);
    expect(await run(store, raw, signature)).toEqual({ status: 200, body: { received: true, result: "not_payable" } });
    expect(events.get("e1")).toMatchObject({ signatureValid: true, error: "not_payable", processed: true });
  });

  it("base indisponible à l'enregistrement : erreur notée sur l'événement, puis levée (503)", async () => {
    const { store, events } = fakeStore();
    store.recordPayment = async () => {
      throw new Error("db down");
    };
    const { raw, signature } = signed(success);
    await expect(run(store, raw, signature)).rejects.toThrow("db down");
    expect(events.get("e1")).toMatchObject({ signatureValid: true, error: "record_failed", processed: true });
  });
});
