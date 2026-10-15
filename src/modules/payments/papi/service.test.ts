import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkState, PaymentProvider, ProviderResult } from "../provider";
import { SecretsUnavailableError } from "../secrets";
import { papi, PAPI_DEFAULT_BASE_URL } from "./adapter";
import type { RecordResult } from "./notification";
import { ensureInvoicePapiLink, PAPI_VALID_HOURS, syncOpenPapiLinks, type PapiStore, type PayableInvoice } from "./service";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-15T10:00:00Z");
const HOUR = 3600_000;
const ORIGIN = "https://app.ivonea.test";

const invoice = (over: Partial<PayableInvoice> = {}): PayableInvoice => ({
  id: "inv",
  workspaceId: "ws",
  number: "F-2026-0001",
  currency: "MGA",
  status: "sent",
  total: 450000,
  amountPaid: 0,
  language: "fr",
  clientName: "Rakoto Jean",
  businessName: "Studio Alice",
  publicUrl: `${ORIGIN}/fr/p/token`,
  ...over,
});

type Link = {
  workspaceId: string;
  reference: string;
  url: string | null;
  status: string;
  expiresAt: Date | null;
  amount: number | null;
  apiKey?: string;
  checked?: number;
  error?: string | null;
};

// Base simulée : un compte Papi, des liens (référence unique, comme en base).
function fakeStore({ connected = true, apiKey = "papi-key-123456789" } = {}) {
  const links: Link[] = [];
  const calls: string[] = [];
  let needsReconnect = false;
  let tick = 0;
  const store: PapiStore = {
    async getAccount() {
      return connected && !needsReconnect ? { id: "acc", apiKey, signingSecret: "pwhsec_x" } : null;
    },
    async markNeedsReconnect() {
      calls.push("reconnect");
      needsReconnect = true;
    },
    async listLinks(invoiceId) {
      return links.filter((l) => l.reference.startsWith(`IVN-${invoiceId}-`)).reverse();
    },
    async closeLink(reference, status) {
      calls.push(`close ${reference} ${status}`);
      const link = links.find((l) => l.reference === reference && l.status === "active");
      if (link) link.status = status;
    },
    async insertLink(link) {
      if (links.some((l) => l.reference === link.reference)) return; // 23505 : sans effet
      links.push({
        workspaceId: link.workspaceId,
        reference: link.reference,
        url: link.url,
        status: link.status,
        expiresAt: link.expiresAt,
        amount: link.amount,
        apiKey: link.apiKey,
      });
    },
    async recordPayment(input): Promise<RecordResult> {
      calls.push(`record ${input.merchantReference} ${input.amount}`);
      const link = links.find((l) => l.reference === input.merchantReference);
      if (!link) return "unknown_link";
      if (link.status === "paid") return "duplicate";
      if (link.amount !== input.amount) return "amount_mismatch";
      link.status = "paid";
      return "recorded";
    },
    async closeStaleLinks(cutoff) {
      calls.push(`stale ${cutoff.toISOString()}`);
    },
    async linksToCheck(limit) {
      return links
        .filter((l) => l.status === "active" || l.status === "cancelled")
        .sort((a, b) => (a.checked ?? -1) - (b.checked ?? -1))
        .slice(0, limit)
        .map((l) => ({ workspaceId: l.workspaceId, reference: l.reference, status: l.status, apiKey: l.apiKey ?? null }));
    },
    async touchLink(reference, error) {
      const link = links.find((l) => l.reference === reference)!;
      link.checked = ++tick;
      if (error) link.error = error;
    },
    async purgeUnverifiedEvents(before) {
      calls.push(`purge ${before.toISOString()}`);
    },
  };
  return { store, links, calls };
}

// Papi simulé au niveau de fetch : l'adaptateur réel construit les requêtes.
type Handler = (url: string, init: RequestInit) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
function mockFetch(handler: Handler) {
  const requests: { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    requests.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    const { status, body } = await handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return requests;
}

const created = (reference: string, amount: number) => ({
  status: 200,
  body: {
    data: {
      amount,
      paymentLink: `https://payment-form.papi.mg/s/${reference}`,
      paymentReference: reference,
      notificationToken: `tok-${reference}`,
      linkExpirationDateTime: NOW.getTime() + PAPI_VALID_HOURS * HOUR,
    },
  },
});
const linkState = (linkStatus: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: { data: { linkStatus, paymentStatus: null, amount: 450000, merchantPaymentReference: "x", ...extra } },
});
// Papi : POST crée le lien demandé ; GET répond selon `state`.
const papiServer =
  (state: (reference: string) => { status: number; body: unknown } = () => linkState("ACTIVE")): Handler =>
  (url, init) => {
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body)) as { reference: string; amount: number };
      return created(body.reference, body.amount);
    }
    return state(decodeURIComponent(url.split("/").pop()!));
  };

afterEach(() => vi.unstubAllGlobals());

describe("ensureInvoicePapiLink", () => {
  it("premier lien : requête conforme à la doc, référence IVN-<facture>-1, lien enregistré", async () => {
    const { store, links } = fakeStore();
    const requests = mockFetch(papiServer());
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({
      status: "ready",
      url: "https://payment-form.papi.mg/s/IVN-inv-1",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`${PAPI_DEFAULT_BASE_URL}/payment-links`);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.Token).toBe("papi-key-123456789");
    expect(requests[0].body).toEqual({
      amount: 450000,
      reference: "IVN-inv-1",
      clientName: "Rakoto Jean",
      description: "Facture F-2026-0001 · Studio Alice",
      successUrl: `${ORIGIN}/fr/p/token?paiement=ok`,
      failureUrl: `${ORIGIN}/fr/p/token?paiement=echec`,
      notificationUrl: `${ORIGIN}/api/papi/notification`,
      validDuration: PAPI_VALID_HOURS,
    });
    expect(links).toMatchObject([{ reference: "IVN-inv-1", status: "active", amount: 450000 }]);
  });

  it("facture en anglais : libellé « Invoice » sur le formulaire Papi", async () => {
    const { store } = fakeStore();
    const requests = mockFetch(papiServer());
    await ensureInvoicePapiLink(invoice({ language: "en" }), { origin: ORIGIN, store, now: NOW });
    expect(requests[0].body?.description).toBe("Invoice F-2026-0001 · Studio Alice");
  });

  it("Papi non proposé : autre devise, moins de 300 Ar dus, brouillon, Papi non connecté", async () => {
    const requests = mockFetch(papiServer());
    for (const inv of [invoice({ currency: "EUR" }), invoice({ amountPaid: 449800 }), invoice({ status: "draft" }), invoice({ status: "paid" })]) {
      expect(await ensureInvoicePapiLink(inv, { origin: ORIGIN, store: fakeStore().store, now: NOW })).toEqual({ status: "skipped" });
    }
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store: fakeStore({ connected: false }).store, now: NOW })).toEqual({
      status: "skipped",
    });
    expect(requests).toHaveLength(0);
  });

  it("clé de chiffrement absente : échec « disabled », pas d'appel à Papi", async () => {
    const { store } = fakeStore();
    store.getAccount = async () => {
      throw new SecretsUnavailableError();
    };
    const requests = mockFetch(papiServer());
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({ status: "failed", reason: "disabled" });
    expect(requests).toHaveLength(0);
  });

  it("lien encore valable et même montant : réutilisé sans appel à Papi", async () => {
    const { store, links } = fakeStore();
    mockFetch(papiServer());
    await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW });
    const requests = mockFetch(papiServer());
    const later = new Date(NOW.getTime() + 24 * HOUR);
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: later })).toEqual({
      status: "ready",
      url: "https://payment-form.papi.mg/s/IVN-inv-1",
    });
    expect(requests).toHaveLength(0);
    expect(links).toHaveLength(1);
  });

  it("lien qui expire dans moins de 10 minutes : relu, annulé, nouvelle tentative -2", async () => {
    const { store, links, calls } = fakeStore();
    mockFetch(papiServer());
    await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW });
    const requests = mockFetch(papiServer());
    const almost = new Date(NOW.getTime() + PAPI_VALID_HOURS * HOUR - 5 * 60_000);
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: almost })).toEqual({
      status: "ready",
      url: "https://payment-form.papi.mg/s/IVN-inv-2",
    });
    expect(requests.map((r) => `${r.method} ${r.url.replace(PAPI_DEFAULT_BASE_URL, "")}`)).toEqual([
      "GET /payment-links/IVN-inv-1",
      "POST /payment-links",
    ]);
    expect(calls).toContain("close IVN-inv-1 cancelled");
    expect(links.map((l) => [l.reference, l.status])).toEqual([
      ["IVN-inv-1", "cancelled"],
      ["IVN-inv-2", "active"],
    ]);
  });

  it("numéro de tentative : compte tous les liens déjà émis (annulés et expirés compris)", async () => {
    const { store, links } = fakeStore();
    links.push(
      { workspaceId: "ws", reference: "IVN-inv-1", url: "https://p/1", status: "expired", expiresAt: NOW, amount: 450000 },
      { workspaceId: "ws", reference: "IVN-inv-2", url: "https://p/2", status: "cancelled", expiresAt: NOW, amount: 450000 },
    );
    const requests = mockFetch(papiServer());
    await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW });
    expect(requests[0].body?.reference).toBe("IVN-inv-3");
  });

  it("montant dû changé (paiement partiel en direct) : nouveau lien pour le reste", async () => {
    const { store, links } = fakeStore();
    mockFetch(papiServer());
    await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW });
    const requests = mockFetch(papiServer());
    const outcome = await ensureInvoicePapiLink(invoice({ amountPaid: 150000 }), { origin: ORIGIN, store, now: NOW });
    expect(outcome).toEqual({ status: "ready", url: "https://payment-form.papi.mg/s/IVN-inv-2" });
    expect(requests.at(-1)?.body).toMatchObject({ reference: "IVN-inv-2", amount: 300000 });
    expect(links.map((l) => [l.reference, l.status, l.amount])).toEqual([
      ["IVN-inv-1", "cancelled", 450000],
      ["IVN-inv-2", "active", 300000],
    ]);
  });

  it("ancien lien payé entre-temps (notification perdue) : paiement enregistré, pas de nouveau lien", async () => {
    const { store, links, calls } = fakeStore();
    mockFetch(papiServer());
    await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW });
    const requests = mockFetch(
      papiServer(() => linkState("PAID", { paymentStatus: "SUCCESS", paymentMethod: "MVOLA", papiPaymentReference: "uuid-1" })),
    );
    const expired = new Date(NOW.getTime() + PAPI_VALID_HOURS * HOUR + HOUR);
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: expired })).toEqual({ status: "paid" });
    expect(requests.map((r) => r.method)).toEqual(["GET"]);
    expect(calls).toContain("record IVN-inv-1 450000");
    expect(links.map((l) => l.status)).toEqual(["paid"]);
  });

  it("Papi indisponible ou requête refusée : échec expliqué, rien d'enregistré", async () => {
    for (const [response, reason] of [
      [{ status: 503, body: {} }, "unavailable"],
      [{ status: 400, body: { error: { code: "CORE_INPUT_400", message: "Le montant doit être supérieur ou égal à 300." } } }, "rejected"],
    ] as const) {
      const { store, links, calls } = fakeStore();
      mockFetch(() => response);
      expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({ status: "failed", reason });
      expect(links).toHaveLength(0);
      expect(calls).not.toContain("reconnect");
    }
  });

  it("référence déjà prise chez Papi (409) : tentative notée en échec, le prochain essai prend -2", async () => {
    const { store, links } = fakeStore();
    mockFetch(() => ({ status: 409, body: { error: { code: "PAYMENT_LINK_CONFLICT", message: "Un lien actif existe déjà" } } }));
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({ status: "failed", reason: "conflict" });
    expect(links.map((l) => [l.reference, l.status, l.url])).toEqual([["IVN-inv-1", "failed", null]]);
    const requests = mockFetch(papiServer());
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({
      status: "ready",
      url: "https://payment-form.papi.mg/s/IVN-inv-2",
    });
    expect(requests.map((r) => r.body?.reference)).toEqual(["IVN-inv-2"]);
  });

  it("clé révoquée (400 « API key invalide ») : compte à reconnecter, plus de bouton Papi", async () => {
    const { store, calls } = fakeStore();
    mockFetch(() => ({ status: 400, body: { error: { code: "CORE_INPUT_400", message: "API key invalide" } } }));
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({ status: "failed", reason: "unauthorized" });
    expect(calls).toContain("reconnect");
    expect(await ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW })).toEqual({ status: "skipped" });
  });

  it("deux ouvertures simultanées : une seule référence enregistrée, même lien servi", async () => {
    const { store, links } = fakeStore();
    mockFetch(papiServer());
    const [a, b] = await Promise.all([
      ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW }),
      ensureInvoicePapiLink(invoice(), { origin: ORIGIN, store, now: NOW }),
    ]);
    expect(a).toEqual(b);
    expect(links).toHaveLength(1);
  });
});

describe("syncOpenPapiLinks", () => {
  const provider = (states: Record<string, ProviderResult<LinkState>>): PaymentProvider => ({
    ...papi,
    getLinkStatus: async (_key, reference) => states[reference] ?? { ok: false, error: "not_found" },
  });
  const state = (linkStatus: LinkState["linkStatus"], over: Partial<LinkState> = {}): ProviderResult<LinkState> => ({
    ok: true,
    value: { linkStatus, paymentStatus: null, method: null, amount: 450000, providerReference: null, notificationToken: null, ...over },
  });
  const seed = (links: Link[], reference: string, status = "active") =>
    links.push({ workspaceId: "ws", reference, url: "https://p", status, expiresAt: new Date(NOW.getTime() + HOUR), amount: 450000 });

  it("applique le statut relu : PAID → paiement enregistré, EXPIRED → lien fermé ; purge et clôture", async () => {
    const { store, links, calls } = fakeStore();
    seed(links, "IVN-a-1");
    seed(links, "IVN-b-1");
    seed(links, "IVN-c-1", "cancelled");
    const result = await syncOpenPapiLinks(store, {
      now: NOW,
      provider: provider({
        "IVN-a-1": state("PAID", { paymentStatus: "SUCCESS", method: "MVOLA", providerReference: "uuid-a" }),
        "IVN-b-1": state("EXPIRED"),
        // Lien remplacé (annulé ici) mais payé chez Papi : rattrapé aussi.
        "IVN-c-1": state("PAID", { paymentStatus: "SUCCESS", method: "AIRTEL_MONEY", providerReference: "uuid-c" }),
      }),
    });
    expect(result).toEqual({ checked: 3, paid: 2, closed: 1, failed: 0, stopped: false });
    expect(links.map((l) => [l.reference, l.status])).toEqual([
      ["IVN-a-1", "paid"],
      ["IVN-b-1", "expired"],
      ["IVN-c-1", "paid"],
    ]);
    expect(calls).toContain(`stale ${new Date(NOW.getTime() - 2 * 24 * HOUR).toISOString()}`);
    expect(calls).toContain(`purge ${new Date(NOW.getTime() - 30 * 24 * HOUR).toISOString()}`);
  });

  it("un lien qui échoue toujours passe en fin de file au lieu de bloquer les autres", async () => {
    const { store, links } = fakeStore();
    seed(links, "IVN-bad-1");
    seed(links, "IVN-ok-1");
    const p = provider({ "IVN-ok-1": state("ACTIVE") });
    p.getLinkStatus = async (key, reference) => {
      if (reference === "IVN-bad-1") throw new Error("boom");
      return { ok: true, value: (state("ACTIVE") as { value: LinkState }).value };
    };
    expect(await syncOpenPapiLinks(store, { now: NOW, limit: 1, provider: p })).toMatchObject({ failed: 1 });
    expect(links.find((l) => l.reference === "IVN-bad-1")?.error).toBe("sync_failed");
    // Passage suivant : le lien en échec a été relu le plus récemment, l'autre passe d'abord.
    expect(await syncOpenPapiLinks(store, { now: NOW, limit: 1, provider: p })).toMatchObject({ checked: 1, failed: 0 });
    expect(links.find((l) => l.reference === "IVN-ok-1")?.checked).toBeDefined();
  });

  it("clé révoquée : compte à reconnecter, les autres liens du compte ne sont pas relus", async () => {
    const { store, links, calls } = fakeStore();
    seed(links, "IVN-a-1");
    seed(links, "IVN-a-2");
    const p = provider({});
    const spy = vi.fn(async (): Promise<ProviderResult<LinkState>> => ({ ok: false, error: "unauthorized" }));
    p.getLinkStatus = spy;
    expect(await syncOpenPapiLinks(store, { now: NOW, provider: p })).toMatchObject({ checked: 1, failed: 1 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(calls).toContain("reconnect");
    expect(links.every((l) => l.checked !== undefined)).toBe(true);
  });

  it("clé remplacée (autre boutique) ou Papi déconnecté : lien relu avec la clé gardée sur le lien", async () => {
    for (const options of [{ apiKey: "papi-key-nouvelle-boutique" }, { connected: false }]) {
      const { store, links } = fakeStore(options);
      seed(links, "IVN-a-1", "cancelled");
      links[0].apiKey = "papi-key-ancienne-boutique";
      const keys: string[] = [];
      const p = provider({});
      p.getLinkStatus = async (key) => {
        keys.push(key);
        return key === "papi-key-ancienne-boutique"
          ? state("PAID", { paymentStatus: "SUCCESS", method: "MVOLA", providerReference: "uuid-a" })
          : { ok: false, error: "not_found" };
      };
      expect(await syncOpenPapiLinks(store, { now: NOW, provider: p })).toMatchObject({ checked: 1, paid: 1, failed: 0 });
      expect(keys).toEqual(["papi-key-ancienne-boutique"]);
      expect(links[0].status).toBe("paid");
    }
  });

  it("clé du lien révoquée, clé régénérée dans la même boutique : relu avec la clé du compte", async () => {
    const { store, links, calls } = fakeStore();
    seed(links, "IVN-a-1");
    links[0].apiKey = "papi-key-revoquee";
    const keys: string[] = [];
    const p = provider({});
    p.getLinkStatus = async (key) => {
      keys.push(key);
      return key === "papi-key-revoquee" ? { ok: false, error: "unauthorized" } : state("ACTIVE");
    };
    expect(await syncOpenPapiLinks(store, { now: NOW, provider: p })).toMatchObject({ checked: 1, failed: 0 });
    expect(keys).toEqual(["papi-key-revoquee", "papi-key-123456789"]);
    // Seule la clé actuelle du compte, si elle est refusée, demande de reconnecter Papi.
    expect(calls).not.toContain("reconnect");
  });

  it("s'arrête avant le budget de temps", async () => {
    const { store, links } = fakeStore();
    seed(links, "IVN-a-1");
    seed(links, "IVN-a-2");
    const p = provider({});
    p.getLinkStatus = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return state("ACTIVE");
    };
    expect(await syncOpenPapiLinks(store, { now: NOW, provider: p, budgetMs: 10 })).toMatchObject({ checked: 1, stopped: true });
  });
});
