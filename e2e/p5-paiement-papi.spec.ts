import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminRest, cronSecret, signUpAndOnboard } from "./helpers";
import { connectPapi, mockLinks, PAPI_MOCK_URL, papiCredentials, signedNotification } from "./papi";

const money = (text: string) => new RegExp(text.replace(/ /g, "\\s"));
const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo", year: "numeric" }).format(new Date());

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

// Facture en ariary en brouillon (préparée directement : la création est testée dans p5-devis-facture).
async function seedDraftInvoice(business: string) {
  const ws = await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`);
  const [{ id: workspaceId }] = (await ws.json()) as { id: string }[];
  const contact = await insert<{ id: string }>("contacts", { workspace_id: workspaceId, name: "Rakoto Jean", phone: "+261341234567" });
  const invoice = await insert<{ id: string }>("invoices", { workspace_id: workspaceId, contact_id: contact.id, currency: "MGA" });
  await insert("document_lines", { workspace_id: workspaceId, invoice_id: invoice.id, description: "Identité visuelle", unit_price: 450000 });
  return invoice.id;
}

test("P5 étapes 5 à 7 : facture en ariary → bouton Papi → notification signée → facture payée", async ({ page, browser }) => {
  const { business } = await signUpAndOnboard(page, "p5papi");
  const { secret } = await connectPapi(page);
  const invoiceId = await seedDraftInvoice(business);
  const number = `F-${year}-0001`;

  // 5. Envoi : lien Papi créé avec la clé de la freelance, référence IVN-<facture>-1.
  await page.goto(`/fr/factures/${invoiceId}`);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByRole("heading", { name: `Facture ${number}` })).toBeVisible();
  await expect(page.getByTestId("notices").filter({ visible: true })).not.toContainText("Papi");
  await expect(page.getByTestId("papi-note").filter({ visible: true })).toBeVisible();
  const reference = `IVN-${invoiceId}-1`;
  const link = (await mockLinks()).find((l) => l.paymentReference === reference);
  expect(link, "lien créé chez Papi").toBeTruthy();
  expect(link!.amount).toBe(450000);
  expect(link!.notificationUrl).toMatch(/\/api\/papi\/notification$/);
  expect(link!.successUrl).toMatch(/\/fr\/p\/[A-Za-z0-9_-]{32}\?paiement=ok$/);
  const publicLink = await page.getByTestId("public-link").filter({ visible: true }).inputValue();

  // Page publique (client sans compte, téléphone) : « Payer avec Papi » en bas.
  const client = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  const pub = await client.newPage();
  await pub.goto(publicLink);
  const pay = pub.getByTestId("pay-online");
  await expect(pay).toHaveText(money("Payer 450 000 Ar avec Papi"));
  await expect(pay).toBeInViewport();
  await expect(pub.getByText("MVola, Orange Money ou Airtel Money").first()).toBeVisible();
  // Le bouton mène au lien Papi (redirection, sans suivre jusqu'à Papi).
  const go = await pub.request.get(`${publicLink}/payer`, { maxRedirects: 0 });
  expect(go.status()).toBe(303);
  expect(go.headers().location).toBe(link!.paymentLink);
  // Le PDF pointe vers la page publique.
  const pdf = await pub.request.get(`${publicLink}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  // 6. Notification forgée (mauvais secret) : refusée, rien ne change.
  const body = {
    paymentStatus: "SUCCESS",
    paymentMethod: "MVOLA",
    currency: "MGA",
    amount: 450000,
    fee: 4500,
    clientName: "Rakoto Jean",
    description: `Facture ${number}`,
    merchantPaymentReference: reference,
    // Référence Papi du paiement (UUID), unique d'un passage à l'autre.
    paymentReference: randomUUID(),
    notificationToken: link!.notificationToken,
    message: "Paiement effectué avec succès.",
  };
  const forged = signedNotification(body, `pwhsec_${"0".repeat(64)}`);
  const refused = await page.request.post("/api/papi/notification", { headers: forged.headers, data: forged.raw });
  expect(refused.status()).toBe(401);

  // Notification signée avec le secret de la freelance : facture payée.
  const genuine = signedNotification(body, secret);
  const accepted = await page.request.post("/api/papi/notification", { headers: genuine.headers, data: genuine.raw });
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ received: true, result: "recorded" });
  // Rejouée (renvoi depuis le tableau de bord Papi) : pas de double paiement.
  const replay = signedNotification(body, secret);
  const again = await page.request.post("/api/papi/notification", { headers: replay.headers, data: replay.raw });
  expect(await again.json()).toEqual({ received: true, result: "duplicate" });
  const payments = await adminRest(`payments?select=amount,fee,method,provider&invoice_id=eq.${invoiceId}`);
  expect(await payments.json()).toEqual([{ amount: 450000, fee: 4500, method: "MVOLA", provider: "papi" }]);
  // Corps brut conservé, signature notée.
  const events = await adminRest(
    `webhook_events?select=signature_valid&raw_body=like.*${encodeURIComponent(reference)}*&order=created_at`,
  );
  expect(((await events.json()) as { signature_valid: boolean }[]).map((e) => e.signature_valid)).toEqual([false, true, true]);

  // 7. La freelance voit « Facture F-2026-0001 payée : 450 000 Ar » (facture et Accueil).
  await page.goto(`/fr/factures/${invoiceId}`);
  await expect(page.getByTestId("paid-notice").filter({ visible: true })).toHaveText(money(`Facture ${number} payée : 450 000 Ar`));
  await expect(page.getByText("Payée en ligne avec Papi (MVola).")).toBeVisible();
  await page.goto("/fr/tableau-de-bord");
  await expect(page.getByTestId("recently-paid").filter({ visible: true })).toContainText(money(`Facture ${number} payée : 450 000 Ar`));

  // Le client voit la facture payée, sans bouton de paiement.
  await pub.reload();
  await expect(pub.getByTestId("public-status")).toHaveText("Payée");
  await expect(pub.getByTestId("pay-online")).toHaveCount(0);
  await client.close();
});

test("Lien expiré recréé à la demande ; rattrapage quotidien d'un paiement sans notification", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p5papi2");
  await connectPapi(page);
  const invoiceId = await seedDraftInvoice(business);
  await page.goto(`/fr/factures/${invoiceId}`);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByRole("heading", { name: /^Facture F-/ })).toBeVisible();
  const publicLink = await page.getByTestId("public-link").filter({ visible: true }).inputValue();

  // Le premier lien a expiré : le client rouvre la facture et paie, nouvelle tentative -2.
  const expired = await adminRest(`payment_links?invoice_id=eq.${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  });
  expect(expired.ok).toBe(true);
  const go = await page.request.get(`${publicLink}/payer`, { maxRedirects: 0 });
  expect(go.status()).toBe(303);
  const second = `IVN-${invoiceId}-2`;
  expect(go.headers().location).toContain(encodeURIComponent(second));
  const links = await adminRest(`payment_links?select=merchant_reference,status&invoice_id=eq.${invoiceId}&order=created_at`);
  expect(await links.json()).toEqual([
    { merchant_reference: `IVN-${invoiceId}-1`, status: "cancelled" },
    { merchant_reference: second, status: "active" },
  ]);

  // Payé chez Papi, notification perdue : le cron relit le lien et passe la facture à payée.
  const paid = await fetch(`${PAPI_MOCK_URL}/__mock/links/${encodeURIComponent(second)}/paid`, { method: "POST" });
  expect(paid.ok).toBe(true);
  const cron = await page.request.get("/api/cron/papi", { headers: { Authorization: `Bearer ${cronSecret()}` } });
  expect(cron.status()).toBe(200);
  expect(await cron.json()).toMatchObject({ paid: 1 });
  const invoice = await adminRest(`invoices?select=status,amount_paid&id=eq.${invoiceId}`);
  expect(await invoice.json()).toEqual([{ status: "paid", amount_paid: 450000 }]);
  // Sans le secret du cron : refusé.
  expect((await page.request.get("/api/cron/papi")).status()).toBe(401);
});

// Envoi d'une facture à lier à Papi ; renvoie le lien public.
async function sendInvoice(page: import("@playwright/test").Page, invoiceId: string) {
  await page.goto(`/fr/factures/${invoiceId}`);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByRole("heading", { name: /^Facture F-/ })).toBeVisible();
  return page.getByTestId("public-link").filter({ visible: true }).inputValue();
}

test("Papi ne répond pas à l'envoi : facture envoyée quand même, message clair", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p5papi3");
  await connectPapi(page, papiCredentials("down-"));
  const invoiceId = await seedDraftInvoice(business);
  const publicLink = await sendInvoice(page, invoiceId);

  await expect(page).toHaveURL(/[?&]papi=unavailable/);
  const notices = page.getByTestId("notices").filter({ visible: true });
  await expect(notices).toContainText("Facture envoyée, mais Papi ne répond pas.");
  // Aucune coordonnée directe saisie : le message le dit au lieu de promettre MVola et RIB.
  await expect(notices).toContainText("Ajoute ton numéro MVola ou ton RIB dans Réglages");
  // Pas de note « ton client peut payer avec Papi » juste à côté de l'échec.
  await expect(page.getByTestId("papi-note")).toHaveCount(0);
  const invoice = await adminRest(`invoices?select=status&id=eq.${invoiceId}`);
  expect(await invoice.json()).toEqual([{ status: "sent" }]);
  const links = await adminRest(`payment_links?select=merchant_reference&invoice_id=eq.${invoiceId}`);
  expect(await links.json()).toEqual([]);

  // Le client rouvre la facture : nouvel essai, toujours en panne → message en clair.
  const go = await page.request.get(`${publicLink}/payer`, { maxRedirects: 0 });
  expect(go.status()).toBe(303);
  expect(go.headers().location).toMatch(/\?paiement=indisponible$/);
});

test("Clé révoquée chez Papi : facture envoyée, Papi à reconnecter, plus de bouton Papi", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p5papi4");
  await connectPapi(page, papiCredentials("revoked-"));
  const invoiceId = await seedDraftInvoice(business);
  const publicLink = await sendInvoice(page, invoiceId);

  await expect(page).toHaveURL(/[?&]papi=unauthorized/);
  await expect(page.getByTestId("notices").filter({ visible: true })).toContainText("Papi a refusé ta clé");
  await page.goto(`/fr/factures/${invoiceId}`);
  await expect(page.getByTestId("papi-reconnect").filter({ visible: true })).toContainText("Papi ne reconnaît plus ta clé");
  await page.goto("/fr/reglages/paiements");
  await expect(page.getByTestId("papi-status")).not.toHaveText("Papi connecté");

  await page.goto(publicLink);
  await expect(page.getByTestId("public-status")).toHaveText("À payer");
  await expect(page.getByTestId("pay-online")).toHaveCount(0);
});

const runCron = async (page: import("@playwright/test").Page) => {
  const cron = await page.request.get("/api/cron/papi", { headers: { Authorization: `Bearer ${cronSecret()}` } });
  expect(cron.status()).toBe(200);
  return cron.json();
};

test("Lien déjà créé puis clé révoquée : le rattrapage le voit, plus de bouton Papi", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p5papi6");
  const { apiKey } = await connectPapi(page);
  const invoiceId = await seedDraftInvoice(business);
  const publicLink = await sendInvoice(page, invoiceId);
  await page.goto(publicLink);
  await expect(page.getByTestId("pay-online")).toBeVisible();

  // Clé révoquée chez Papi après la création du lien : le rattrapage reçoit 401.
  expect((await fetch(`${PAPI_MOCK_URL}/__mock/keys/${encodeURIComponent(apiKey)}/revoke`, { method: "POST" })).ok).toBe(true);
  await runCron(page);
  const links = await adminRest(`payment_links?select=status&invoice_id=eq.${invoiceId}`);
  expect(await links.json()).toEqual([{ status: "cancelled" }]);

  await page.reload();
  await expect(page.getByTestId("public-status")).toHaveText("À payer");
  await expect(page.getByTestId("pay-online")).toHaveCount(0);
  await page.goto(`/fr/factures/${invoiceId}`);
  await expect(page.getByTestId("papi-reconnect").filter({ visible: true })).toBeVisible();
});

test("Clé remplacée par celle d'une autre boutique : nouveau lien, l'ancien reste vérifiable et rattrapé", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p5papi5");
  const first = await connectPapi(page);
  const invoiceId = await seedDraftInvoice(business);
  const publicLink = await sendInvoice(page, invoiceId);
  const oldReference = `IVN-${invoiceId}-1`;
  const oldLink = (await mockLinks()).find((l) => l.paymentReference === oldReference)!;
  expect(oldLink).toBeTruthy();
  // Deuxième facture, dont l'ancien lien sera payé sans notification.
  const lostId = await seedDraftInvoice(business);
  await sendInvoice(page, lostId);

  // Réglages > Moyens de paiement > Remplacer ta clé Papi.
  const second = papiCredentials();
  await page.goto("/fr/reglages/paiements");
  await page.getByText("Remplacer ta clé Papi", { exact: true }).click();
  await page.getByLabel("Clé API Papi").fill(second.apiKey);
  await page.getByLabel("Secret de signature").fill(second.secret);
  await page.getByRole("button", { name: "Vérifier et remplacer la clé" }).click();
  await expect(page.getByTestId("papi-status")).toHaveText("Papi connecté");

  // Le client clique « Payer avec Papi » : lien créé dans la nouvelle boutique, tentative -2.
  const go = await page.request.get(`${publicLink}/payer`, { maxRedirects: 0 });
  expect(go.status()).toBe(303);
  expect(go.headers().location).toContain(encodeURIComponent(`IVN-${invoiceId}-2`));
  const links = await adminRest(`payment_links?select=merchant_reference,status&invoice_id=eq.${invoiceId}&order=created_at`);
  expect(await links.json()).toEqual([
    { merchant_reference: oldReference, status: "cancelled" },
    { merchant_reference: `IVN-${invoiceId}-2`, status: "active" },
  ]);

  // Le client avait encore l'ancien lien ouvert et paie : notification signée avec l'ancien
  // secret, vérifiée avec la copie gardée sur le lien → facture payée.
  const body = {
    paymentStatus: "SUCCESS",
    paymentMethod: "AIRTEL_MONEY",
    currency: "MGA",
    amount: 450000,
    fee: 4500,
    merchantPaymentReference: oldReference,
    paymentReference: randomUUID(),
    notificationToken: oldLink.notificationToken,
  };
  const notification = signedNotification(body, first.secret);
  const response = await page.request.post("/api/papi/notification", { headers: notification.headers, data: notification.raw });
  expect(await response.json()).toEqual({ received: true, result: "recorded" });
  const invoice = await adminRest(`invoices?select=status,amount_paid&id=eq.${invoiceId}`);
  expect(await invoice.json()).toEqual([{ status: "paid", amount_paid: 450000 }]);

  // Ancien lien de la deuxième facture payé dans l'ancienne boutique, notification perdue :
  // le rattrapage le relit avec la clé gardée sur le lien (la nouvelle clé reçoit 404).
  const paid = await fetch(`${PAPI_MOCK_URL}/__mock/links/${encodeURIComponent(`IVN-${lostId}-1`)}/paid`, { method: "POST" });
  expect(paid.ok).toBe(true);
  expect(await runCron(page)).toMatchObject({ paid: 1 });
  const lost = await adminRest(`invoices?select=status,amount_paid&id=eq.${lostId}`);
  expect(await lost.json()).toEqual([{ status: "paid", amount_paid: 450000 }]);
});
