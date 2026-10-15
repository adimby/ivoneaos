// Whop simulé pour les tests de bout en bout : mêmes chemins, champs et en-têtes que l'API
// v1 (https://docs.whop.com/developer/platforms/enroll-connected-accounts,
//  https://docs.whop.com/developer/platforms/collect-payments-for-connected-accounts).
// L'application le joint via WHOP_API_BASE_URL (playwright.config.ts).
//   Clé valide : toute clé commençant par « whop-test- ». Autre clé : 401.
//   L'inscription (account_links) et le paiement (purchase_url) renvoient des adresses
//   https://whop.com/… que le test intercepte sans les suivre.
//   POST /__mock/accounts/<id>/activate : inscription terminée (cartes acceptées).
//   GET /__mock/checkouts : configurations de paiement créées (pour signer un webhook),
//   avec deleted: true une fois supprimées (DELETE /checkout_configurations/{id}).
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.WHOP_MOCK_PORT ?? 3198);
const accounts = new Map();
const checkouts = new Map();

const id = (prefix) => `${prefix}_${randomBytes(8).toString("hex")}`;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve(null);
      }
    });
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const path = url.pathname.replace(/^\/api\/v1/, "");

  if (path === "/__mock/health") return send(res, 200, { ok: true });
  if (path === "/__mock/checkouts" && req.method === "GET") return send(res, 200, { checkouts: [...checkouts.values()] });
  const activate = path.match(/^\/__mock\/accounts\/([^/]+)\/activate$/);
  if (activate && req.method === "POST") {
    const account = accounts.get(activate[1]);
    if (!account) return send(res, 404, {});
    account.capabilities.accept_card_payments = "active";
    return send(res, 200, account);
  }

  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer whop-test-")) return send(res, 401, { error: { type: "unauthorized", message: "Invalid API key" } });
  if (!req.headers["api-version-date"]) return send(res, 400, { error: { message: "Api-Version-Date required" } });

  if (path === "/accounts" && req.method === "POST") {
    const body = await readBody(req);
    if (!body?.email) return send(res, 422, { error: { message: "email required" } });
    // Idempotent sur (e-mail, metadata.external_id) (doc).
    const existing = [...accounts.values()].find((a) => a.email === body.email && a.metadata?.external_id === body.metadata?.external_id);
    if (existing) return send(res, 200, existing);
    const account = { id: id("biz"), email: body.email, title: body.title, metadata: body.metadata, capabilities: { accept_card_payments: "inactive" } };
    accounts.set(account.id, account);
    return send(res, 200, account);
  }
  const getAccount = path.match(/^\/accounts\/([^/]+)$/);
  if (getAccount && req.method === "GET") {
    const account = accounts.get(decodeURIComponent(getAccount[1]));
    return account ? send(res, 200, account) : send(res, 404, { error: { message: "Not found" } });
  }
  if (path === "/account_links" && req.method === "POST") {
    const body = await readBody(req);
    if (!accounts.has(body?.account_id) || body.use_case !== "account_onboarding") return send(res, 422, { error: { message: "invalid" } });
    const onboarding = new URL(`https://whop.com/onboarding/${body.account_id}`);
    onboarding.searchParams.set("return_url", body.return_url);
    onboarding.searchParams.set("refresh_url", body.refresh_url);
    return send(res, 200, { url: onboarding.toString(), expires_at: new Date(Date.now() + 300_000).toISOString() });
  }
  if (path === "/checkout_configurations" && req.method === "POST") {
    const body = await readBody(req);
    const account = accounts.get(body?.account_id);
    if (!account || account.capabilities.accept_card_payments !== "active") return send(res, 422, { error: { message: "account cannot accept payments" } });
    if (body.plan?.plan_type !== "one_time" || !(body.plan.initial_price > 0)) return send(res, 422, { error: { message: "invalid plan" } });
    const key = req.headers["idempotency-key"];
    const existing = key && [...checkouts.values()].find((c) => c.idempotencyKey === key);
    if (existing) return send(res, 200, existing);
    const checkoutId = id("ch");
    const checkout = {
      id: checkoutId,
      purchase_url: `/checkout/${checkoutId}/`,
      account_id: body.account_id,
      plan: body.plan,
      metadata: body.metadata,
      redirect_url: body.redirect_url,
      idempotencyKey: key,
    };
    checkouts.set(checkoutId, checkout);
    return send(res, 200, checkout);
  }
  const checkoutPath = path.match(/^\/checkout_configurations\/([^/]+)$/);
  if (checkoutPath && req.method === "DELETE") {
    const checkout = checkouts.get(decodeURIComponent(checkoutPath[1]));
    if (!checkout || checkout.deleted) return send(res, 404, { error: { message: "Not found" } });
    checkout.deleted = true;
    return send(res, 200, { id: checkout.id, deleted: true });
  }
  send(res, 404, { error: { message: "Not found" } });
}).listen(port, "127.0.0.1", () => console.log(`Whop simulé sur http://127.0.0.1:${port}`));
