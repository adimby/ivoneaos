import { createHmac, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminRest, signUpAndOnboard } from "./helpers";

// Étape 7 : tableau de bord chiffré, Réglages > Offre, paiement par carte Whop.
// L'instance principale (port 3100) tourne sans WHOP_API_KEY ; la seconde (3101) avec Whop
// activé sur le Whop simulé (e2e/whop-mock.mjs), même construction .next.
const WHOP_APP = `http://127.0.0.1:${process.env.E2E_WHOP_PORT ?? 3101}`;
const WHOP_MOCK = `http://127.0.0.1:${process.env.WHOP_MOCK_PORT ?? 3198}`;
const WHOP_WEBHOOK_SECRET = "ws_e2e_whop_webhook_secret";

const money = (text: string) => new RegExp(text.replace(/ /g, "\\s"));

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

async function patch(path: string, body: object) {
  const response = await adminRest(path, { method: "PATCH", body: JSON.stringify(body) });
  expect(response.ok, `${path} : ${await response.clone().text()}`).toBe(true);
}

async function workspaceId(business: string): Promise<string> {
  const ws = await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`);
  return ((await ws.json()) as { id: string }[])[0].id;
}

async function seedInvoice(ws: string, contactId: string, amount: number, currency: "MGA" | "EUR" = "MGA") {
  const invoice = await insert<{ id: string }>("invoices", {
    workspace_id: ws,
    contact_id: contactId,
    currency,
    ...(currency === "EUR" && { exchange_rate: 5000 }),
  });
  await insert("document_lines", { workspace_id: ws, invoice_id: invoice.id, description: "Identité visuelle", unit_price: amount });
  return invoice.id;
}

test("Tableau de bord : encaissé, en attente (EUR converti), opportunités ; Réglages > Offre", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p7dash");

  // Compte neuf : chaque bloc propose la prochaine action.
  await expect(page.getByTestId("dash-collected").filter({ visible: true })).toContainText("Connecter Papi");
  await expect(page.getByTestId("dash-pending").filter({ visible: true })).toContainText("Préparer mon premier devis");
  await expect(page.getByTestId("dash-deals").filter({ visible: true })).toContainText("Ajouter mon premier contact");

  const ws = await workspaceId(business);
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Rakoto Jean", phone: "+261341234567" });
  const stages = (await (await adminRest(`pipeline_stages?select=id&workspace_id=eq.${ws}&kind=eq.open&order=position`)).json()) as {
    id: string;
  }[];
  await insert("deals", { workspace_id: ws, contact_id: contact.id, stage_id: stages[0].id, title: "Site vitrine", amount: 800000 });
  // Facture en ariary envoyée puis payée (paiement manuel) ; facture EUR envoyée, à 5000 Ar l'euro.
  const paid = await seedInvoice(ws, contact.id, 450000);
  await patch(`invoices?id=eq.${paid}`, { status: "sent" });
  await insert("payments", { workspace_id: ws, invoice_id: paid, provider: "manual", method: "MVOLA", amount: 450000, currency: "MGA" });
  const eur = await seedInvoice(ws, contact.id, 12050, "EUR");
  await patch(`invoices?id=eq.${eur}`, { status: "sent" });

  await page.goto("/fr/tableau-de-bord");
  await expect(page.getByTestId("dash-collected-amount").filter({ visible: true })).toHaveText(money("450 000 Ar"));
  await expect(page.getByTestId("dash-collected").filter({ visible: true })).toContainText("1 paiement reçu");
  // 120,50 € × 5000 = 602 500 Ar : converti au taux de la facture.
  await expect(page.getByTestId("dash-pending-amount").filter({ visible: true })).toHaveText(money("602 500 Ar"));
  await expect(page.getByTestId("dash-pending-count").filter({ visible: true })).toHaveText("1 facture à encaisser");
  await expect(page.getByTestId("dash-overdue")).toHaveCount(0);
  const stage = page.getByTestId("dash-stage").filter({ visible: true }).filter({ hasText: "· 1" });
  await expect(stage).toHaveCount(1);
  await expect(stage).toContainText(money("800 000 Ar"));
  // Blocs lisibles sur un téléphone : rien ne déborde à 360 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Réglages > Offre : usage de l'offre Découverte.
  await page.goto("/fr/reglages");
  await page.getByTestId("settings-plan").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/fr\/reglages\/offre$/);
  await expect(page.getByTestId("plan-name")).toHaveText("Découverte");
  await expect(page.getByTestId("usage-contacts")).toContainText("1 / 20");
  await expect(page.getByTestId("usage-documents")).toContainText("2 / 3");
  await expect(page.getByTestId("offer-lancement")).toContainText(money("50 000 Ar par mois"));
  await expect(page.getByTestId("offer-decouverte")).toContainText("Ton offre");
  // Sans IVONEA_CONTACT_EMAIL : pas de lien, une consigne.
  await expect(page.getByTestId("plan-contact")).toHaveCount(0);
  await expect(page.getByText("Pour changer d'offre, écris à Ivonea.")).toBeVisible();
  // Avec l'adresse (seconde instance) : lien mailto.
  await page.goto(`${WHOP_APP}/fr/reglages/offre`);
  await expect(page.getByTestId("plan-contact")).toHaveAttribute("href", /^mailto:bonjour@example\.test\?subject=/);
});

test("Whop masqué sans WHOP_API_KEY ; avec Whop : inscription, « Payer par carte », webhook signé → facture payée", async ({
  page,
  browser,
}) => {
  const { business } = await signUpAndOnboard(page, "p7whop");

  // Instance sans clé Whop : aucune trace de Whop.
  await page.goto("/fr/reglages/paiements");
  await expect(page.getByTestId("papi-status")).toBeVisible();
  await expect(page.getByTestId("whop-card")).toHaveCount(0);

  // Devise par défaut en euros : Papi (ariary) n'est pas proposé sur l'accueil vide ;
  // Whop l'est quand il est activé.
  const ws = await workspaceId(business);
  await patch(`workspaces?id=eq.${ws}`, { default_currency: "EUR" });
  await page.goto("/fr/tableau-de-bord");
  await expect(page.getByTestId("dash-collected").filter({ visible: true })).toContainText("Aucun paiement reçu ce mois-ci");
  await expect(page.getByTestId("dash-collected").filter({ visible: true })).not.toContainText("Papi");
  await page.goto(`${WHOP_APP}/fr/tableau-de-bord`);
  await expect(page.getByTestId("dash-collected").filter({ visible: true })).toContainText("Connecter Whop");

  // Instance avec Whop (même session : cookies de 127.0.0.1).
  await page.goto(`${WHOP_APP}/fr/reglages/paiements`);
  await expect(page.getByTestId("whop-status")).toHaveText("Non connecté");
  // Commission de la plateforme annoncée (WHOP_PLATFORM_FEE_PERCENT=5).
  await expect(page.getByTestId("whop-intro")).toContainText(money("Ivonea OS prélève en plus 5 % de chaque paiement par carte"));
  // Inscription hébergée par Whop : interceptée, puis terminée dans le Whop simulé.
  await page.route("https://whop.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Whop</h1>" }));
  await page.getByRole("button", { name: "Connecter Whop" }).click();
  await page.waitForURL(/^https:\/\/whop\.com\/onboarding\/biz_/);
  const onboarding = new URL(page.url());
  const accountId = onboarding.pathname.split("/").pop()!;
  const returnUrl = onboarding.searchParams.get("return_url")!;
  expect(returnUrl).toBe(`${WHOP_APP}/fr/reglages/paiements/whop`);
  // Retour avant validation : inscription en cours.
  await page.goto(returnUrl);
  await expect(page).toHaveURL(/\/fr\/reglages\/paiements\?whop=pending$/);
  await expect(page.getByTestId("whop-status")).toHaveText("Inscription en cours");
  await expect(page.getByRole("status").filter({ hasText: "pas encore terminée" })).toBeVisible();
  // Validation plus tard chez Whop : « Vérifier mon statut » relit le compte.
  expect((await fetch(`${WHOP_MOCK}/__mock/accounts/${accountId}/activate`, { method: "POST" })).ok).toBe(true);
  await page.getByTestId("whop-check-status").click();
  await expect(page).toHaveURL(/\/fr\/reglages\/paiements\?whop=connected$/);
  await expect(page.getByTestId("whop-status")).toHaveText("Whop connecté");

  await expect(page.getByTestId("whop-check-status")).toHaveCount(0);

  // Facture EUR envoyée : paiement unique créé sur le compte connecté, commission 5 %.
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Jane Doe", email: "jane@example.test" });
  const invoiceId = await seedInvoice(ws, contact.id, 12050, "EUR");
  await page.goto(`${WHOP_APP}/fr/factures/${invoiceId}`);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByTestId("public-link").filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId("notices").filter({ visible: true })).not.toContainText("Whop");
  const reference = `IVW-${invoiceId}-1`;
  type Checkout = { id: string; account_id: string; plan: Record<string, unknown>; metadata: Record<string, string> };
  const { checkouts } = (await (await fetch(`${WHOP_MOCK}/__mock/checkouts`)).json()) as { checkouts: Checkout[] };
  const checkout = checkouts.find((c) => c.metadata?.ivonea_reference === reference);
  expect(checkout, "paiement créé chez Whop").toBeTruthy();
  expect(checkout!.account_id).toBe(accountId);
  expect(checkout!.plan).toMatchObject({
    company_id: accountId,
    plan_type: "one_time",
    initial_price: 120.5,
    currency: "eur",
    adaptive_pricing_enabled: false,
    application_fee_amount: 6.03,
  });
  const publicLink = await page.getByTestId("public-link").filter({ visible: true }).inputValue();
  expect(publicLink.startsWith(`${WHOP_APP}/fr/p/`)).toBe(true);

  // Client (téléphone, sans compte) : « Payer par carte » mène au paiement Whop.
  const client = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  const pub = await client.newPage();
  await pub.goto(publicLink);
  const pay = pub.getByTestId("pay-card");
  await expect(pay).toHaveText(money("Payer 120,50 € par carte"));
  await expect(pay).toBeInViewport();
  await expect(pub.getByTestId("pay-online")).toHaveCount(0);
  const go = await pub.request.get(`${publicLink}/carte`, { maxRedirects: 0 });
  expect(go.status()).toBe(303);
  expect(go.headers().location).toBe(`https://whop.com/checkout/${checkout!.id}/`);
  // Même facture servie par l'instance sans Whop : pas de bouton carte.
  await pub.goto(publicLink.replace(WHOP_APP, ""));
  await expect(pub.getByTestId("pay-card")).toHaveCount(0);

  // Webhook payment.succeeded : forgé → 401 ; signé → facture payée ; rejoué → doublon.
  // Compte connecté réglé en dollars (preferred_settlement_currency) : le client a payé
  // 120,50 € (presentment_total), Whop règle ≈ 131,20 $ (total, currency) ; la facture en
  // euros est payée, commission Whop non déduite (autre devise).
  const paymentEvent = (ref: string, checkoutId: string, presented: string, settled = presented, currency = "eur") => ({
    type: "payment.succeeded",
    id: `evt_${randomBytes(6).toString("hex")}`,
    account_id: accountId,
    data: {
      id: `pay_${randomBytes(6).toString("hex")}`,
      status: "paid",
      presentment_total: { amount: presented, currency: "eur", decimals: 2 },
      total: { amount: settled, currency, decimals: 2 },
      amount_after_fees: { amount: settled, currency, decimals: 2 },
      currency,
      metadata: { ivonea_reference: ref },
      checkout_configuration_id: checkoutId,
      account_id: accountId,
      paid_at: new Date().toISOString(),
    },
  });
  const event = paymentEvent(reference, checkout!.id, "120.50", "131.20", "usd");
  const send = (secret: string, body: object = event) => {
    const raw = JSON.stringify(body);
    const id = `msg_${randomBytes(6).toString("hex")}`;
    const t = Math.floor(Date.now() / 1000);
    const signature = `v1,${createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${t}.${raw}`).digest("base64")}`;
    return page.request.post(`${WHOP_APP}/api/whop/webhook`, {
      headers: { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": String(t), "webhook-signature": signature },
      data: raw,
    });
  };
  expect((await send("ws_forged")).status()).toBe(401);
  const accepted = await send(WHOP_WEBHOOK_SECRET);
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ received: true, result: "recorded" });
  expect(await (await send(WHOP_WEBHOOK_SECRET)).json()).toEqual({ received: true, result: "duplicate" });
  const payments = await adminRest(`payments?select=amount,fee,method,provider,currency&invoice_id=eq.${invoiceId}`);
  expect(await payments.json()).toEqual([{ amount: 12050, fee: 0, method: "CARD", provider: "whop", currency: "EUR" }]);
  // Paiement authentique reçu sur un autre compte Whop (métadonnées recopiées) : non
  // enregistré, mais signalé sur la facture (le client a pu être débité).
  const foreign = paymentEvent(reference, checkout!.id, "120.50");
  foreign.data.account_id = "biz_autre";
  expect(await (await send(WHOP_WEBHOOK_SECRET, foreign)).json()).toEqual({ received: true, result: "account_mismatch" });
  await page.goto(`${WHOP_APP}/fr/factures/${invoiceId}`);
  await expect(page.getByTestId("whop-issue")).toContainText("reçu sur un autre compte Whop");

  await pub.goto(publicLink);
  await expect(pub.getByTestId("public-status")).toHaveText("Payée");
  await expect(pub.getByTestId("pay-card")).toHaveCount(0);
  await client.close();

  // Seconde facture (50,00 €), réglée à la main alors que son paiement par carte est ouvert :
  // la configuration est supprimée chez Whop et le lien annulé ici.
  const second = await seedInvoice(ws, contact.id, 5000, "EUR");
  await page.goto(`${WHOP_APP}/fr/factures/${second}`);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByTestId("public-link").filter({ visible: true })).toBeVisible();
  const secondRef = `IVW-${second}-1`;
  const listCheckouts = async () =>
    ((await (await fetch(`${WHOP_MOCK}/__mock/checkouts`)).json()) as { checkouts: (Checkout & { deleted?: boolean })[] }).checkouts;
  const secondCheckout = (await listCheckouts()).find((c) => c.metadata?.ivonea_reference === secondRef)!;
  expect(secondCheckout.deleted).toBeFalsy();
  await page.getByRole("button", { name: "Marquer payée" }).click();
  const dialog = page.getByRole("dialog", { name: "Marquer la facture payée ?" });
  await dialog.getByRole("button", { name: "Confirmer le paiement" }).click();
  await expect(page.getByText("Facture marquée payée.")).toBeVisible();
  expect((await listCheckouts()).find((c) => c.id === secondCheckout.id)?.deleted).toBe(true);
  const links = await adminRest(`payment_links?select=status&merchant_reference=eq.${secondRef}`);
  expect(await links.json()).toEqual([{ status: "cancelled" }]);

  // Paiement Whop arrivé quand même (onglet resté ouvert avant la suppression) : montant
  // différent → signalé sur la facture ; bon montant → enregistré (argent reçu), trop-perçu affiché.
  expect(await (await send(WHOP_WEBHOOK_SECRET, paymentEvent(secondRef, secondCheckout.id, "49.00"))).json()).toEqual({
    received: true,
    result: "amount_mismatch",
  });
  await page.goto(`${WHOP_APP}/fr/factures/${second}`);
  await expect(page.getByTestId("whop-issue")).toContainText(secondRef);
  expect(await (await send(WHOP_WEBHOOK_SECRET, paymentEvent(secondRef, secondCheckout.id, "50.00"))).json()).toEqual({
    received: true,
    result: "recorded",
  });
  await page.reload();
  await expect(page.getByTestId("overpaid-notice")).toContainText(money("50,00 €"));
});
