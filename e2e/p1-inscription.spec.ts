import { expect, test } from "@playwright/test";
import { adminRest, authAttemptKey, openMore, signIn } from "./helpers";

// Petit PNG valide (1 × 1) pour le logo.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("P1 : s'inscrire, diagnostic, profil pro, tableau de bord", async ({ page, browser }) => {
  const email = `p1-${Date.now()}@example.test`;

  // Page d'accueil → connexion.
  await page.goto("/fr");
  await page.getByRole("link", { name: "Commencer" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);

  // Page demandée sans session : connexion, puis retour après l'accueil guidé.
  await page.goto("/fr/factures");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Ffr%2Ffactures$/);

  // Un code faux est refusé avec un message clair.
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await page.getByLabel("Code à 6 chiffres").fill("000000");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByText("Ce code est incorrect ou a expiré.", { exact: false })).toBeVisible();

  // Retour à l'e-mail, puis connexion avec le vrai code (lu dans Mailpit).
  await page.getByRole("button", { name: "Changer d'adresse" }).click();
  await signIn(page, email);

  // Accueil guidé forcé, la page demandée est gardée pour la suite.
  await expect(page).toHaveURL(/\/fr\/demarrage\?next=%2Ffactures$/);
  await expect(page.getByText("Étape 1 sur 2")).toBeVisible();
  // HTML servi : uniquement des formulaires POST (actions serveur). Un envoi avant le
  // chargement du JavaScript ne met donc jamais les saisies dans l'URL.
  const html = await (await page.request.get("/fr/demarrage")).text();
  const forms = html.match(/<form\b[^>]*>/g) ?? [];
  expect(forms.length).toBeGreaterThan(0);
  for (const form of forms) expect(form).toMatch(/method="post"/i);

  // Langue et déconnexion possibles dès l'accueil guidé (en-tête) ; la page demandée reste.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/demarrage\?next=%2Ffactures$/);
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/demarrage\?next=%2Ffactures$/);
  await expect(page.getByRole("banner").getByRole("button", { name: "Se déconnecter" })).toBeVisible();

  // Étape 1 : continuer sans répondre affiche les erreurs.
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();

  await page.getByLabel("Ton métier").fill("Graphiste");
  await page.getByLabel("Depuis combien de temps es-tu freelance ?").selectOption("lt1");
  await page.getByLabel("Combien de clients as-tu en ce moment ?").fill("0");
  await page.getByLabel("Ton objectif de revenu mensuel").fill("1 500 000");
  await page.getByRole("button", { name: "Continuer" }).click();

  // Étape 2 : niveau « Lancer », métier repris, retour possible sans perte.
  await expect(page.getByText("Étape 2 sur 2")).toBeVisible();
  await expect(page.getByText("Lancer", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Métier", { exact: true })).toHaveValue("Graphiste");
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByLabel("Ton objectif de revenu mensuel")).toHaveValue("1 500 000");
  await page.getByRole("button", { name: "Continuer" }).click();

  await page.getByLabel("Nom commercial").fill("Studio Hery");
  await page.getByLabel("Logo (facultatif)").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Adresse", { exact: true }).fill("Lot II A 12, Antananarivo");
  await page.getByLabel("NIF").fill("300012345");
  await page.getByLabel("STAT").fill("74111 11 2020 0 01234");
  await page.getByLabel("Régime fiscal").selectOption("impot_synthetique");
  await page.getByRole("button", { name: "Terminer" }).click();

  // NIF trop court : refusé par le serveur, les autres saisies sont conservées.
  await expect(page.getByText("Le NIF compte 10 chiffres.")).toBeVisible();
  await expect(page.getByLabel("Nom commercial")).toHaveValue("Studio Hery");
  await page.getByLabel("NIF").fill("3000123456");

  // Faux PNG (texte annoncé image/png) : refusé par le serveur avant toute écriture,
  // l'accueil guidé n'est pas terminé pour autant.
  await page.getByLabel("Logo (facultatif)").setInputFiles({
    name: "faux.png",
    mimeType: "image/png",
    buffer: Buffer.from("pas une image"),
  });
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Le logo doit être une image PNG, JPEG ou WebP.")).toBeVisible();
  const probe = await page.context().newPage();
  await probe.goto("/fr/tableau-de-bord");
  await expect(probe).toHaveURL(/\/fr\/demarrage$/);
  await probe.close();

  await page.getByLabel("Logo (facultatif)").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Terminer" }).click();

  // Retour à la page demandée avant la connexion.
  await expect(page).toHaveURL(/\/fr\/factures$/);

  // Tableau de bord : liste de démarrage du niveau Lancer, rien encore fait.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("link", { name: "Accueil" }).click();
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  await expect(page.getByRole("heading", { name: "Studio Hery" })).toBeVisible();
  await expect(page.getByText("Niveau : Lancer")).toBeVisible();
  const items = page.locator("[data-testid^=checklist-]");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText("Ajoute ton premier prospect");
  for (const item of await items.all()) await expect(item).toHaveAttribute("data-done", "false");

  // Premier contact depuis la liste de démarrage : l'étape est cochée au retour.
  await page.getByTestId("checklist-contact").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/fr\/contacts$/);
  await page.getByRole("link", { name: "Nouveau contact" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Rasoa Fara");
  await page.getByLabel("Téléphone").fill("032 11 222 33");
  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(page.getByRole("heading", { name: "Rasoa Fara" })).toBeVisible();
  await nav.getByRole("link", { name: "Accueil" }).click();
  await expect(page.getByTestId("checklist-contact").filter({ visible: true })).toHaveAttribute("data-done", "true");

  // Barre d'onglets et menu « Plus » → Réglages : profil enregistré, offre Découverte.
  await expect(nav.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
  await openMore(page, "Plus");
  await page.getByRole("link", { name: "Réglages" }).click();
  await expect(page).toHaveURL(/\/fr\/reglages$/);
  await expect(page.getByLabel("NIF")).toHaveValue("3000123456");
  await expect(page.getByText("Découverte")).toBeVisible();
  const logo = page.getByRole("img", { name: "Logo de Studio Hery" });
  await expect(logo).toBeVisible();
  // Image réellement chargée (URL signée du Storage, permise par la politique de contenu).
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // Réglages : nouveau logo et adresse enregistrés ; le champ logo est ensuite vidé
  // (un nouvel enregistrement ne renvoie pas le même fichier).
  await page.getByLabel("Logo (facultatif)").setInputFiles({ name: "logo2.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Adresse", { exact: true }).fill("Lot II B 7, Antananarivo");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Profil enregistré.")).toBeVisible();
  await expect(page.getByLabel("Logo (facultatif)")).toHaveValue("");
  await expect(page.getByRole("img", { name: "Logo de Studio Hery" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Adresse", { exact: true })).toHaveValue("Lot II B 7, Antananarivo");

  // Avant le chargement du JavaScript (connexion lente) : fichiers JS de l'application
  // bloqués, seuls les petits scripts intégrés à la page tournent. Le menu « Plus » est
  // alors une page ; les formulaires sont en POST (rien dans l'URL) et leur bouton
  // d'envoi attend le JavaScript.
  const noJs = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 360, height: 780 },
    baseURL: new URL(page.url()).origin,
  });
  await noJs.route("**/_next/static/**/*.js", (route) => route.abort());
  const plain = await noJs.newPage();
  await plain.goto("/fr/tableau-de-bord");
  await openMore(plain, "Plus");
  await expect(plain).toHaveURL(/\/fr\/plus$/);
  await plain.getByRole("link", { name: "Réglages" }).click();
  await expect(plain).toHaveURL(/\/fr\/reglages$/);
  await expect(plain.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  const settingsForms = (await (await plain.request.get("/fr/reglages")).text()).match(/<form\b[^>]*>/g) ?? [];
  expect(settingsForms.length).toBeGreaterThan(0);
  for (const form of settingsForms) expect(form).toMatch(/method="post"/i);
  await noJs.close();

  // Langue : anglais, enregistré dans le profil et appliqué.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/reglages$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  // Déconnexion : les pages de l'application renvoient vers la connexion, puis y ramènent,
  // dans la langue du profil (anglais) même depuis la page de connexion en français.
  await openMore(page, "More");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/en\/connexion$/);
  await page.goto("/fr/reglages");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Ffr%2Freglages$/);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/en\/reglages$/);
});

test("Connexion : au-delà des essais permis, message clair (limites par e-mail)", async ({ page }) => {
  const email = `limite-auth-${Date.now()}@example.test`;
  // Limites atteintes (src/modules/auth/rate-limit.ts : 10 vérifications, 15 envois par
  // quart d'heure et par e-mail, toutes IP confondues) : tentatives récentes enregistrées
  // directement.
  const seed = (key: string, count: number) =>
    adminRest("auth_attempts", { method: "POST", body: JSON.stringify(Array.from({ length: count }, () => ({ key }))) });
  expect((await seed(authAttemptKey("verify", "email", email), 10)).ok).toBe(true);

  await page.goto("/fr/connexion");
  await signIn(page, email);
  await expect(page.getByText("Trop de tentatives. Pour protéger ton compte, attends un quart d'heure")).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/connexion$/);

  // Envois épuisés : « Renvoyer un code » est refusé avec le même message.
  expect((await seed(authAttemptKey("send", "email", email), 15)).ok).toBe(true);
  await page.getByRole("button", { name: "Renvoyer un code" }).click();
  await expect(page.getByText("Trop de tentatives. Pour protéger ton compte, attends un quart d'heure")).toBeVisible();
  await expect(page.getByText("Nouveau code envoyé.")).toHaveCount(0);
});
