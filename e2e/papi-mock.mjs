// Papi simulé pour les tests de bout en bout (Papi n'a pas de bac à sable gratuit) :
// mêmes chemins, en-têtes, champs et codes que la doc officielle
// (https://docs.papi.mg/fr/docs/api/payment-link/create-payment-link,
//  https://docs.papi.mg/fr/docs/api/payment-link/get-payment-link-status).
// L'application le joint via PAPI_API_BASE_URL (playwright.config.ts).
//   Clé valide : toute clé commençant par « papi-test- ». Autre clé : refusée.
//   Pannes à la création du lien (la clé reste valide en lecture, donc à la connexion) :
//     « papi-test-down-… » : 503 (Papi indisponible) ;
//     « papi-test-revoked-… » : 400 « API key invalide » (clé révoquée depuis).
//   Un lien n'est lisible qu'avec la clé qui l'a créé (autre clé : autre boutique, 404).
//   GET /__mock/links : liens créés (pour que le test signe une notification réaliste).
//   POST /__mock/links/<reference>/paid : marque un lien payé (rattrapage par le cron).
//   POST /__mock/keys/<clé>/revoke : révoque une clé (401 en lecture, 400 à la création).
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.PAPI_MOCK_PORT ?? 3199);
const links = new Map();
// Clé qui a créé chaque lien (boutique), par référence.
const owners = new Map();
const revoked = new Set();

const validKey = (token) => typeof token === "string" && token.startsWith("papi-test-") && !revoked.has(token);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function linkStatus(link) {
  if (link.paid) return "PAID";
  return link.linkExpirationDateTime < Date.now() ? "EXPIRED" : "ACTIVE";
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const path = url.pathname;

  if (path === "/__mock/health") return send(res, 200, { ok: true });
  if (path === "/__mock/links" && req.method === "GET") return send(res, 200, { links: [...links.values()] });
  const paid = path.match(/^\/__mock\/links\/([^/]+)\/paid$/);
  if (paid && req.method === "POST") {
    const link = links.get(decodeURIComponent(paid[1]));
    if (!link) return send(res, 404, {});
    link.paid = true;
    link.papiPaymentReference = randomUUID();
    return send(res, 200, link);
  }
  const revoke = path.match(/^\/__mock\/keys\/([^/]+)\/revoke$/);
  if (revoke && req.method === "POST") {
    revoked.add(decodeURIComponent(revoke[1]));
    return send(res, 200, { ok: true });
  }

  if (path === "/payment-links" && req.method === "POST") {
    // Sur cet endpoint, une clé absente ou inconnue reçoit 400 (doc).
    if (!validKey(req.headers.token) || req.headers.token.startsWith("papi-test-revoked-")) {
      return send(res, 400, { error: { code: "CORE_INPUT_400", message: "API key invalide" } });
    }
    if (req.headers.token.startsWith("papi-test-down-")) return send(res, 503, { error: { code: "CORE_500", message: "Service indisponible" } });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: { code: "CORE_INPUT_400", message: "Corps de la requête invalide : JSON attendu" } });
    }
    if (!(body.amount >= 300)) {
      return send(res, 400, { error: { code: "CORE_INPUT_400", message: "Le montant doit être supérieur ou égal à 300." } });
    }
    const existing = links.get(body.reference);
    if (existing && linkStatus(existing) === "ACTIVE") {
      if (existing.amount !== body.amount) {
        return send(res, 409, { error: { code: "PAYMENT_LINK_CONFLICT", message: "Un lien de paiement actif existe déjà" } });
      }
      return send(res, 200, { data: existing });
    }
    const now = Date.now();
    const link = {
      amount: body.amount,
      currency: "MGA",
      displayCurrency: "MGA",
      linkCreationDateTime: now,
      linkExpirationDateTime: now + (body.validDuration ?? 1) * 3600_000,
      paymentLink: `https://payment-form.papi.mg/mock/payments/${encodeURIComponent(body.reference)}`,
      clientName: body.clientName,
      paymentReference: body.reference,
      description: body.description,
      successUrl: body.successUrl ?? null,
      failureUrl: body.failureUrl ?? null,
      notificationUrl: body.notificationUrl ?? null,
      notificationToken: randomUUID(),
      isTestMode: false,
      shortLink: null,
    };
    links.set(body.reference, link);
    owners.set(body.reference, req.headers.token);
    return send(res, 200, { data: link });
  }

  const read = path.match(/^\/payment-links\/([^/]+)$/);
  if (read && req.method === "GET") {
    if (!validKey(req.headers.token)) return send(res, 401, { error: { code: "CORE_PERM_0001", message: "API key invalide" } });
    const reference = decodeURIComponent(read[1]);
    const link = links.get(reference);
    if (!link || owners.get(reference) !== req.headers.token) return send(res, 404, { error: { code: "CORE_404", message: `Aucun lien de paiement pour la référence ${reference}` } });
    const status = linkStatus(link);
    return send(res, 200, {
      data: {
        linkStatus: status,
        paymentStatus: status === "PAID" ? "SUCCESS" : null,
        paymentMethod: status === "PAID" ? "MVOLA" : null,
        currency: "MGA",
        displayCurrency: "MGA",
        amount: link.amount,
        clientName: link.clientName,
        description: link.description,
        merchantPaymentReference: reference,
        papiPaymentReference: link.papiPaymentReference ?? null,
        notificationToken: link.notificationToken,
        message: null,
        paymentLink: link.paymentLink,
        shortLink: null,
        linkCreationDateTime: link.linkCreationDateTime,
        linkExpirationDateTime: link.linkExpirationDateTime,
        isTestMode: false,
      },
    });
  }

  send(res, 404, { error: { code: "CORE_404", message: "Not found" } });
}).listen(port, "127.0.0.1", () => console.log(`Papi simulé sur http://127.0.0.1:${port}`));
