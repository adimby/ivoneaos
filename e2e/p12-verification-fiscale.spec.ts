import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { adminRest, cronSecret, onboardToAdminStep, signIn, signUpAndOnboard, sql, storageFiles, storageUpload } from "./helpers";
import { readEmail } from "./mailpit";

// Vérification de la carte fiscale (docs/spec-mvp.md, « Vérification fiscale ») : dépôt
// recto/verso, lecture automatique (OCR), file des admins, plafond de 3 factures.
// NIF et STAT enregistrés par signUpAndOnboard : 3000123456 et 74111112020001234.
const NIF = "3000123456";
const STAT = "74111112020001234";
const BUCKET = "fiscal-documents";

async function workspaceOf(business: string): Promise<string> {
  const [{ id }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as { id: string }[];
  return id;
}

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

// Photo de carte fiscale générée par le test : texte net, comme une photo bien cadrée.
async function cardImage(page: Page, lines: string[]): Promise<Buffer> {
  const card = await page.context().newPage();
  await card.setViewportSize({ width: 900, height: 560 });
  await card.setContent(
    `<body style="margin:0;background:#fff;color:#000;font:600 40px/1.6 Arial,sans-serif;padding:48px">
      <p style="margin:0 0 24px">CARTE FISCALE</p>${lines.map((line) => `<p style="margin:0">${line}</p>`).join("")}</body>`,
  );
  const image = await card.screenshot({ type: "png" });
  await card.close();
  return image;
}

async function cardPhotos(page: Page, nif: string, stat: string) {
  return {
    front: await cardImage(page, [`NIF : ${nif}`, "RAKOTO Hery"]),
    back: await cardImage(page, [`STAT : ${stat}`, "Antananarivo"]),
  };
}

// Dépôt recto/verso depuis les réglages, puis envoi pour vérification.
async function submitCard(page: Page, photos: { front: Buffer; back: Buffer }, { open = true } = {}) {
  if (open) await page.goto("/fr/reglages");
  const panel = page.locator("#verification-fiscale");
  await expect(panel.getByRole("heading", { name: "Vérification de ta carte fiscale" })).toBeVisible();
  // Bouton activé après l'hydratation : les dépôts partent du navigateur.
  await expect(page.getByTestId("fiscal-submit")).toBeEnabled();
  await page.locator("#fiscal-front").setInputFiles({ name: "recto.png", mimeType: "image/png", buffer: photos.front });
  await expect(page.getByTestId("file-drop-fiscal-front")).toHaveAttribute("data-status", "done");
  await page.locator("#fiscal-back").setInputFiles({ name: "verso.png", mimeType: "image/png", buffer: photos.back });
  await expect(page.getByTestId("file-drop-fiscal-back")).toHaveAttribute("data-status", "done");
  await page.getByTestId("fiscal-submit").click();
  await expect(page.getByTestId("fiscal-checking")).toBeVisible();
}

// Admin de la plateforme, dans son propre navigateur.
async function newAdmin(browser: Browser, baseURL: string) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, locale: "fr-FR", baseURL });
  const page = await context.newPage();
  const { email, business } = await signUpAndOnboard(page, "p12-admin");
  const [{ user_id }] = (await (await adminRest(`workspace_members?select=user_id&workspace_id=eq.${await workspaceOf(business)}`)).json()) as {
    user_id: string;
  }[];
  await insert("platform_admins", { user_id });
  return { page, email, close: () => context.close() };
}

async function lastRequest(ws: string) {
  const [request] = (await (
    await adminRest(`fiscal_verifications?select=id,status,method,front_path,back_path,rejection_reason&workspace_id=eq.${ws}&order=created_at.desc&limit=1`)
  ).json()) as { id: string; status: string; method: string | null; front_path: string | null; back_path: string | null; rejection_reason: string | null }[];
  return request;
}

async function violationsOf(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await expect(page.locator("main").filter({ visible: true }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const found = violations.map((v) => `${path} ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  const viewport = page.viewportSize()!.width;
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width > viewport) found.push(`${path} déborde : ${width} px de large`);
  return found;
}

test("Démarrage : NIF, STAT et carte fiscale à l'étape administrative → vérifiée automatiquement", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const business = `Studio p12-demarrage ${stamp}`;
  await page.goto("/fr/connexion");
  await signIn(page, `p12-demarrage-${stamp}@example.test`);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);
  await onboardToAdminStep(page, business);
  const ws = await workspaceOf(business);

  await page.getByLabel("NIF", { exact: false }).fill("300 012 3456");
  await page.getByLabel("STAT", { exact: false }).fill(STAT);
  await page.getByLabel("Régime fiscal", { exact: false }).selectOption("impot_synthetique");
  // Une seule photo : les deux faces sont demandées, rien n'est envoyé.
  const photos = await cardPhotos(page, NIF, STAT);
  await page.locator("#fiscal-front").setInputFiles({ name: "recto.png", mimeType: "image/png", buffer: photos.front });
  await expect(page.getByTestId("file-drop-fiscal-front")).toHaveAttribute("data-status", "done");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Ajoute la photo du recto et celle du verso.")).toBeVisible();

  await page.locator("#fiscal-back").setInputFiles({ name: "verso.png", mimeType: "image/png", buffer: photos.back });
  await expect(page.getByTestId("file-drop-fiscal-back")).toHaveAttribute("data-status", "done");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByTestId("onboarding-fiscal-result")).toHaveText(
    "Ta carte fiscale est vérifiée : tu peux envoyer toutes tes factures.",
    { timeout: 60_000 },
  );
  const [workspace] = (await (await adminRest(`workspaces?select=nif,stat,tax_regime,fiscal_status&id=eq.${ws}`)).json()) as {
    nif: string;
    stat: string;
    tax_regime: string;
    fiscal_status: string;
  }[];
  expect(workspace).toEqual({ nif: NIF, stat: STAT, tax_regime: "impot_synthetique", fiscal_status: "verified" });
  expect(await storageFiles(BUCKET, ws)).toEqual([]);

  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  // Démarrage terminé : /demarrage renvoie vers l'application.
  await page.goto("/fr/demarrage");
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  await page.goto("/fr/reglages");
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("Vérifiée");
});

test("Démarrage : « Terminer » sans photo enregistre les numéros puis ouvre le tableau de bord", async ({ page }) => {
  const stamp = Date.now();
  const business = `Studio p12-sans-photo ${stamp}`;
  await page.goto("/fr/connexion");
  await signIn(page, `p12-sans-photo-${stamp}@example.test`);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);
  await onboardToAdminStep(page, business);
  const ws = await workspaceOf(business);

  await page.getByLabel("NIF", { exact: false }).fill(NIF);
  await page.getByLabel("STAT", { exact: false }).fill("7411 1112 0200 01234");
  await page.getByLabel("Régime fiscal", { exact: false }).selectOption("tva");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  const [workspace] = (await (await adminRest(`workspaces?select=nif,stat,tax_regime,fiscal_status&id=eq.${ws}`)).json()) as object[];
  expect(workspace).toEqual({ nif: NIF, stat: STAT, tax_regime: "tva", fiscal_status: "unverified" });
  const [answers] = (await (await adminRest(`onboarding_answers?select=completed_at&workspace_id=eq.${ws}`)).json()) as { completed_at: string | null }[];
  expect(answers.completed_at).not.toBeNull();
});

test("Démarrage : carte à vérifier à la main → « en cours de vérification » ; refus avec motif ; « déjà en cours » à jour", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const business = `Studio p12-demarrage-attente ${stamp}`;
  await page.goto("/fr/connexion");
  await signIn(page, `p12-demarrage-attente-${stamp}@example.test`);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);
  await onboardToAdminStep(page, business);
  const ws = await workspaceOf(business);
  const pendingText =
    "Ta carte fiscale est en cours de vérification. Tu recevras un e-mail dès que c'est fait ; en attendant, tu peux envoyer jusqu'à 3 factures.";

  // Numéros lus différents de ceux saisis : vérification à la main, en attente.
  await page.getByLabel("NIF", { exact: false }).fill(NIF);
  await page.getByLabel("STAT", { exact: false }).fill(STAT);
  await page.getByLabel("Régime fiscal", { exact: false }).selectOption("impot_synthetique");
  const other = await cardPhotos(page, "3000999999", "74111112020009999");
  await page.locator("#fiscal-front").setInputFiles({ name: "recto.png", mimeType: "image/png", buffer: other.front });
  await expect(page.getByTestId("file-drop-fiscal-front")).toHaveAttribute("data-status", "done");
  await page.locator("#fiscal-back").setInputFiles({ name: "verso.png", mimeType: "image/png", buffer: other.back });
  await expect(page.getByTestId("file-drop-fiscal-back")).toHaveAttribute("data-status", "done");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByTestId("onboarding-fiscal-result")).toHaveText(pendingText, { timeout: 60_000 });
  expect((await lastRequest(ws)).status).toBe("pending");
  // Rechargement : le résultat reste affiché (statut de la carte).
  await page.reload();
  await expect(page.getByTestId("onboarding-fiscal-result")).toHaveText(pendingText);

  // Carte refusée (décision d'un admin) : le motif est montré au-dessus du formulaire.
  const patch = (body: object) => adminRest(`workspaces?id=eq.${ws}`, { method: "PATCH", body: JSON.stringify(body) });
  expect((await patch({ fiscal_status: "rejected", fiscal_rejection_reason: "Photo floue" })).ok).toBe(true);
  await page.reload();
  await expect(page.getByTestId("onboarding-fiscal-rejected")).toHaveText("Ta carte fiscale n'a pas pu être vérifiée. Motif : Photo floue");
  await expect(page.getByLabel("NIF", { exact: false })).toHaveValue(NIF);

  // Carte envoyée entre-temps depuis un autre onglet : « déjà en cours », la page se met à
  // jour et montre le résultat.
  const photos = await cardPhotos(page, NIF, STAT);
  await page.locator("#fiscal-front").setInputFiles({ name: "recto.png", mimeType: "image/png", buffer: photos.front });
  await expect(page.getByTestId("file-drop-fiscal-front")).toHaveAttribute("data-status", "done");
  await page.locator("#fiscal-back").setInputFiles({ name: "verso.png", mimeType: "image/png", buffer: photos.back });
  await expect(page.getByTestId("file-drop-fiscal-back")).toHaveAttribute("data-status", "done");
  expect((await patch({ fiscal_status: "pending", fiscal_rejection_reason: null })).ok).toBe(true);
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByTestId("onboarding-fiscal-result")).toHaveText(pendingText, { timeout: 30_000 });
});

test("Cas 1 : numéros lus sur la carte → vérifiée automatiquement, photos supprimées", async ({ page }) => {
  test.setTimeout(120_000);
  const { business } = await signUpAndOnboard(page, "p12-auto", { verified: false });
  const ws = await workspaceOf(business);

  await page.goto("/fr/reglages");
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("Non vérifiée");
  await expect(page.getByTestId("fiscal-counter").filter({ visible: true })).toHaveText("Encore 3 factures avant la vérification.");
  // Accessibilité du formulaire de dépôt (photo refusée comprise).
  await page.locator("#fiscal-front").setInputFiles({ name: "carte.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByTestId("file-drop-fiscal-front").getByRole("alert")).toContainText("Ce format n'est pas accepté");
  const { violations } = await new AxeBuilder({ page }).include("#verification-fiscale").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id} : ${v.help}`)).toEqual([]);

  // Faux PNG (texte annoncé en image/png) : refusé par le serveur, fichiers supprimés et
  // zones de dépôt remises à vide (pas de chemins morts).
  const fake = Buffer.from("ceci n'est pas une image");
  await submitCard(page, { front: fake, back: fake }, { open: false });
  await expect(page.getByText("Une des photos n'a pas pu être lue")).toBeVisible();
  await expect(page.getByTestId("file-drop-fiscal-front")).toHaveAttribute("data-status", "empty");
  await expect(page.getByTestId("file-drop-fiscal-back")).toHaveAttribute("data-status", "empty");
  expect(await storageFiles(BUCKET, ws)).toEqual([]);

  await submitCard(page, await cardPhotos(page, NIF, STAT), { open: false });
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("Vérifiée", { timeout: 60_000 });
  await expect(page.getByTestId("fiscal-verification").filter({ visible: true })).toContainText("Ta carte fiscale a été vérifiée le");

  const request = await lastRequest(ws);
  expect(request).toMatchObject({ status: "verified", method: "automatic", front_path: null, back_path: null });
  expect(await storageFiles(BUCKET, ws)).toEqual([]);
  const [workspace] = (await (await adminRest(`workspaces?select=fiscal_status,fiscal_status_at&id=eq.${ws}`)).json()) as {
    fiscal_status: string;
    fiscal_status_at: string | null;
  }[];
  expect(workspace.fiscal_status).toBe("verified");
  expect(workspace.fiscal_status_at).not.toBeNull();

  // Un changement de NIF remet la vérification à zéro : la freelance en est prévenue avant
  // (aide sous NIF et STAT) et après l'enregistrement.
  await expect(page.getByTestId("fiscal-reset-warning").filter({ visible: true })).toHaveCount(2);
  await expect(page.getByTestId("fiscal-reset-warning").filter({ visible: true }).first()).toHaveText(
    "Le modifier annule la vérification de ta carte fiscale : tu devras redéposer les photos.",
  );
  await page.getByLabel("NIF", { exact: true }).fill("3000123457");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByTestId("fiscal-reset-done").filter({ visible: true })).toContainText("la vérification de ta carte fiscale est annulée");
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("Non vérifiée");
  await expect(page.getByTestId("fiscal-reset-warning")).toHaveCount(0);
});

test("Cas 2 : numéros différents → en attente → l'admin valide, photos supprimées, e-mails reçus", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await newAdmin(browser, baseURL!);
  const { email, business } = await signUpAndOnboard(page, "p12-manuel", { verified: false });
  const ws = await workspaceOf(business);

  const since = new Date(Date.now() - 2_000);
  await submitCard(page, await cardPhotos(page, "1111111111", "22222222222222222"));
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("En cours de vérification", { timeout: 60_000 });
  await expect(page.getByTestId("fiscal-verification").filter({ visible: true })).toContainText("Nous vérifions tes photos à la main");
  await expect(page.getByTestId("fiscal-submit")).toHaveCount(0);
  const request = await lastRequest(ws);
  expect(request.status).toBe("pending");
  expect((await storageFiles(BUCKET, ws)).sort()).toEqual([request.front_path!.split("/")[1], request.back_path!.split("/")[1]].sort());

  // E-mail aux admins : lien vers la demande.
  const notice = await readEmail(admin.email, since, (m) => m.Subject === `Carte fiscale à vérifier : ${business}`);
  const link = notice.Text.match(/https?:\/\/\S+\/fr\/admin\/verifications\/[0-9a-f-]{36}/)![0];
  expect(link).toContain(request.id);

  // File d'attente, détail avec les photos, validation.
  await admin.page.goto("/fr/plus");
  await admin.page.getByRole("link", { name: "Admin" }).click();
  await expect(admin.page).toHaveURL(/\/fr\/admin\/verifications$/);
  await expect(admin.page.getByTestId("admin-queue")).toContainText(business);
  await admin.page.goto(new URL(link).pathname);
  await expect(admin.page.getByTestId("admin-nif")).toHaveText(NIF);
  await expect(admin.page.getByTestId("admin-stat")).toHaveText(STAT);
  for (const side of ["Recto", "Verso"]) {
    const photo = admin.page.getByRole("img", { name: `${side} de la carte fiscale de ${business}` });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  const report = await violationsOf(admin.page, new URL(link).pathname);
  await admin.page.getByTestId("admin-verify").click();
  await expect(admin.page).toHaveURL(/\/fr\/admin\/verifications\?ok=verified&email=sent$/);
  await expect(admin.page.getByTestId("admin-ok")).toContainText("Demande validée");
  await expect(admin.page.getByTestId("admin-ok-email")).toHaveText("Le freelance a été prévenu par e-mail.");
  await expect(admin.page.getByTestId("admin-queue").or(admin.page.getByTestId("admin-queue-empty"))).not.toContainText(business);
  await expect(admin.page.getByTestId("admin-history")).toContainText(business);
  report.push(...(await violationsOf(admin.page, "/fr/admin/verifications")));
  // Grand écran.
  await admin.page.setViewportSize({ width: 1280, height: 800 });
  report.push(...(await violationsOf(admin.page, "/fr/admin/verifications")));
  expect(report, report.join("\n")).toEqual([]);

  expect(await lastRequest(ws)).toMatchObject({ status: "verified", method: "manual", front_path: null, back_path: null });
  expect(await storageFiles(BUCKET, ws)).toEqual([]);
  const decision = await readEmail(email, since, (m) => m.Subject === "Ta carte fiscale est vérifiée");
  expect(decision.Text).toContain("/fr/reglages#verification-fiscale");

  await page.goto("/fr/reglages");
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("Vérifiée");
  await admin.close();
});

test("Cas 3 : refus avec motif, visible chez le freelance qui peut redéposer", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const admin = await newAdmin(browser, baseURL!);
  const { email, business } = await signUpAndOnboard(page, "p12-refus", { verified: false });
  const ws = await workspaceOf(business);

  const since = new Date(Date.now() - 2_000);
  await submitCard(page, await cardPhotos(page, "1111111111", "22222222222222222"));
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("En cours de vérification", { timeout: 60_000 });
  const report = await violationsOf(page, "/fr/reglages");
  const request = await lastRequest(ws);

  const reason = "Photo floue : reprends-la en pleine lumière.";
  // Second onglet ouvert sur la même demande avant la décision.
  const stale = await admin.page.context().newPage();
  await stale.goto(`/fr/admin/verifications/${request.id}`);
  await admin.page.goto(`/fr/admin/verifications/${request.id}`);
  await admin.page.getByLabel("Motif du refus").fill(reason);
  await admin.page.getByTestId("admin-reject").click();
  await expect(admin.page).toHaveURL(/\/fr\/admin\/verifications\?ok=rejected&email=sent$/);
  await expect(admin.page.getByTestId("admin-history")).toContainText(reason);
  expect(await lastRequest(ws)).toMatchObject({ status: "rejected", method: "manual", rejection_reason: reason, front_path: null });
  expect(await storageFiles(BUCKET, ws)).toEqual([]);
  // Décision unique : la demande traitée ne s'ouvre plus (page introuvable, rendue dans
  // l'application déjà en cours d'envoi, comme toute fiche inconnue).
  await admin.page.goto(`/fr/admin/verifications/${request.id}`);
  await expect(admin.page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(admin.page.getByTestId("admin-reject")).toHaveCount(0);
  // L'autre onglet valide trop tard : retour à la liste avec « déjà traitée ».
  await stale.getByTestId("admin-verify").click();
  await expect(stale).toHaveURL(/\/fr\/admin\/verifications\?erreur=fiscal_request_not_pending$/);
  await expect(stale.getByTestId("admin-error")).toHaveText("Cette demande a déjà été traitée.");
  await stale.close();

  const decision = await readEmail(email, since, (m) => m.Subject === "Ta carte fiscale n'a pas pu être vérifiée");
  expect(decision.Text).toContain(`Motif : ${reason}`);
  await page.goto("/fr/reglages");
  await expect(page.getByTestId("fiscal-status").filter({ visible: true })).toHaveText("Refusée");
  await expect(page.getByTestId("fiscal-rejection").filter({ visible: true })).toContainText(reason);
  await expect(page.getByTestId("fiscal-submit")).toBeVisible();
  report.push(...(await violationsOf(page, "/fr/reglages")));
  expect(report, report.join("\n")).toEqual([]);

  // Photo de téléphone trop lourde (PNG de plus de 10 Mo, 3000 px) : réduite dans le
  // navigateur avant l'envoi (JPEG, 2000 px au plus), donc acceptée.
  const heavy = await sharp({ create: { width: 3000, height: 2400, channels: 3, background: "#888", noise: { type: "gaussian", mean: 128, sigma: 60 } } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  expect(heavy.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  await page.locator("#fiscal-front").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: heavy });
  await expect(page.getByTestId("file-drop-fiscal-front")).toHaveAttribute("data-status", "done", { timeout: 30_000 });
  const uploaded = await storageFiles(BUCKET, ws);
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0]).toMatch(/\.jpg$/);
  await admin.close();
});

test("Cas 4 : la 4e facture est bloquée tant que la carte n'est pas vérifiée", async ({ page }) => {
  test.setTimeout(120_000);
  const { business } = await signUpAndOnboard(page, "p12-plafond", { verified: false });
  const ws = await workspaceOf(business);
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Rakoto Jean", phone: "+261341234567" });
  // Plan payant : seule la vérification limite l'envoi.
  const paid = await adminRest(`workspaces?id=eq.${ws}`, { method: "PATCH", body: JSON.stringify({ plan: "lancement" }) });
  expect(paid.ok, await paid.clone().text()).toBe(true);
  const invoices: { id: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const invoice = await insert<{ id: string }>("invoices", { workspace_id: ws, contact_id: contact.id, currency: "MGA" });
    await insert("document_lines", { workspace_id: ws, invoice_id: invoice.id, description: `Logo ${i + 1}`, unit_price: 100000 });
    invoices.push(invoice);
  }
  const send = (id: string) => adminRest(`invoices?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
  for (const invoice of invoices.slice(0, 2)) expect((await send(invoice.id)).ok).toBe(true);

  // Compteur, puis 3e facture envoyée pendant que la 4e est ouverte.
  await page.goto(`/fr/factures/${invoices[3].id}`);
  // Il reste des factures : une ligne discrète et un lien vers le dépôt (Réglages), pas le
  // formulaire au milieu de la facture.
  await expect(page.getByTestId("fiscal-counter").filter({ visible: true })).toHaveText("Encore 1 facture avant la vérification.");
  await expect(page.getByTestId("fiscal-upload-link").filter({ visible: true })).toHaveAttribute("href", "/fr/reglages#verification-fiscale");
  await expect(page.getByTestId("fiscal-submit")).toHaveCount(0);
  expect((await send(invoices[2].id)).ok).toBe(true);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByText("Pour envoyer les suivantes, ta carte fiscale doit être vérifiée : dépose une photo")).toBeVisible();
  await expect(page.getByTestId("fiscal-limit-link").filter({ visible: true })).toHaveAttribute("href", "#verification-fiscale");
  await expect(page.getByRole("heading", { name: "Facture (brouillon)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer la facture" })).toHaveCount(0);
  await expect(page.getByTestId("fiscal-counter").filter({ visible: true })).toContainText("Tu as atteint la limite de 3 factures");
  await expect(page.getByTestId("fiscal-submit")).toBeVisible();
  // Plafond atteint : l'action du bas mène au dépôt des photos.
  await expect(page.getByTestId("fiscal-goto-upload").filter({ visible: true })).toHaveAttribute("href", "#verification-fiscale");
  const report = await violationsOf(page, `/fr/factures/${invoices[3].id}`);
  expect(report, report.join("\n")).toEqual([]);

  // Refus en base aussi, quel que soit le chemin.
  const refused = await send(invoices[3].id);
  expect(refused.ok).toBe(false);
  expect(await refused.text()).toContain("fiscal_verification_required");

  // Un devis s'envoie toujours.
  const quote = await insert<{ id: string }>("quotes", { workspace_id: ws, contact_id: contact.id });
  await insert("document_lines", { workspace_id: ws, quote_id: quote.id, description: "Charte", unit_price: 100000 });
  expect((await adminRest(`quotes?id=eq.${quote.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) })).ok).toBe(true);

  // Rien sur la facture ni sur la page du client.
  const [{ public_token }] = (await (await adminRest(`invoices?select=public_token&id=eq.${invoices[0].id}`)).json()) as { public_token: string }[];
  await page.goto(`/fr/p/${public_token}`);
  await expect(page.locator("main")).not.toContainText(/vérifi|carte fiscale/i);

  // Une fois la carte vérifiée (admin), la 4e part.
  expect((await adminRest(`workspaces?id=eq.${ws}`, { method: "PATCH", body: JSON.stringify({ fiscal_status: "verified", fiscal_status_at: new Date().toISOString() }) })).ok).toBe(true);
  await page.goto(`/fr/factures/${invoices[3].id}`);
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByTestId("document-status").filter({ visible: true })).toHaveText("Envoyée");
});

test("Rattrapage quotidien (cron) : avis aux admins oublié, photos annulées et dépôts abandonnés supprimés", async ({ page, browser, baseURL, request }) => {
  test.setTimeout(120_000);
  const admin = await newAdmin(browser, baseURL!);
  const { business } = await signUpAndOnboard(page, "p12-cron", { verified: false });
  const ws = await workspaceOf(business);
  const photo = await cardImage(page, ["NIF : 1"]);
  const path = () => `${ws}/${randomUUID()}.png`;
  const files = { oldOrphan: path(), newOrphan: path(), pendingFront: path(), pendingBack: path(), cancelledFront: path(), cancelledBack: path() };
  for (const name of Object.values(files)) await storageUpload(BUCKET, name, photo, "image/png");
  // Déposés il y a 2 h, sauf newOrphan (envoi peut-être en cours : gardé).
  const aged = Object.entries(files).filter(([key]) => key !== "newOrphan").map(([, name]) => `'${name}'`);
  sql(`update storage.objects set created_at = now() - interval '2 hours' where bucket_id = '${BUCKET}' and name in (${aged.join(", ")})`);
  // Demande restée en attente sans avis (route arrêtée pendant la lecture), il y a 10 min ;
  // demande annulée (NIF changé) dont les photos n'ont pas été supprimées.
  const pending = await insert<{ id: string }>("fiscal_verifications", {
    workspace_id: ws,
    nif: NIF,
    stat: STAT,
    front_path: files.pendingFront,
    back_path: files.pendingBack,
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  });
  const cancelled = await insert<{ id: string }>("fiscal_verifications", {
    workspace_id: ws,
    nif: NIF,
    stat: STAT,
    status: "cancelled",
    front_path: files.cancelledFront,
    back_path: files.cancelledBack,
  });

  const since = new Date(Date.now() - 2_000);
  const run = await request.get("/api/cron/reminders", { headers: { Authorization: `Bearer ${cronSecret()}` } });
  expect(run.status()).toBe(200);
  expect((await run.json()).fiscal).toMatchObject({ notified: expect.any(Number), folders: expect.any(Number) });

  const notice = await readEmail(admin.email, since, (m) => m.Subject === `Carte fiscale à vérifier : ${business}`);
  expect(notice.Text).toContain(`/fr/admin/verifications/${pending.id}`);
  const state = async (id: string) =>
    ((await (await adminRest(`fiscal_verifications?select=admins_notified_at,front_path,back_path&id=eq.${id}`)).json()) as {
      admins_notified_at: string | null;
      front_path: string | null;
      back_path: string | null;
    }[])[0];
  const notified = await state(pending.id);
  expect(notified.admins_notified_at).not.toBeNull();
  expect(await state(cancelled.id)).toMatchObject({ front_path: null, back_path: null });
  const name = (p: string) => p.split("/")[1];
  expect((await storageFiles(BUCKET, ws)).sort()).toEqual([files.newOrphan, files.pendingFront, files.pendingBack].map(name).sort());

  // Passage suivant : l'avis n'est pas renvoyé.
  expect((await request.get("/api/cron/reminders", { headers: { Authorization: `Bearer ${cronSecret()}` } })).status()).toBe(200);
  expect((await state(pending.id)).admins_notified_at).toBe(notified.admins_notified_at);
  await admin.close();
});

test("Pages admin introuvables pour une freelance et sans session", async ({ page }) => {
  await signUpAndOnboard(page, "p12-nonadmin");
  expect((await page.goto("/fr/admin/verifications"))!.status()).toBe(404);
  expect((await page.goto("/en/admin/verifications/00000000-0000-0000-0000-000000000000"))!.status()).toBe(404);
  await page.goto("/fr/plus");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.context().clearCookies();
  expect((await page.goto("/fr/admin/verifications"))!.status()).toBe(404);
});
