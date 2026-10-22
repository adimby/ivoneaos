import { expect, test, type Page } from "@playwright/test";
import { adminRest, authAttemptKey, openMore, pageBeforeJavaScript, signIn } from "./helpers";

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
  await page.getByLabel("Code reçu par e-mail").fill("000000");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByText("Ce code est incorrect ou a expiré.", { exact: false })).toBeVisible();

  // Retour à l'e-mail, puis connexion avec le vrai code (lu dans Mailpit).
  await page.getByRole("button", { name: "Changer d'adresse" }).click();
  await signIn(page, email);

  // Démarrage forcé, la page demandée est gardée pour la suite.
  await expect(page).toHaveURL(/\/fr\/demarrage\?next=%2Ffactures$/);
  await expect(page.getByText("Étape 1 / 3").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Ton activité" })).toBeVisible();
  // Indicateur d'étapes : l'étape en cours porte aria-current.
  const stepper = page.getByRole("navigation", { name: "Étapes du démarrage" });
  await expect(stepper.locator("[aria-current=step]").filter({ visible: true })).toHaveCount(1);
  // HTML servi : uniquement des formulaires POST (actions serveur). Un envoi avant le
  // chargement du JavaScript ne met donc jamais les saisies dans l'URL.
  const html = await (await page.request.get("/fr/demarrage")).text();
  const forms = html.match(/<form\b[^>]*>/g) ?? [];
  expect(forms.length).toBeGreaterThan(0);
  for (const form of forms) expect(form).toMatch(/method="post"/i);

  // Langue et déconnexion possibles dès le démarrage (en-tête) ; la page demandée reste.
  await page.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/demarrage\?next=%2Ffactures$/);
  await expect(page.getByText("Step 1 / 3").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/demarrage\?next=%2Ffactures$/);
  await expect(page.getByRole("banner").getByRole("button", { name: "Se déconnecter" })).toBeVisible();

  // Étape 1 : continuer sans répondre affiche les erreurs, liées aux champs ; astérisque
  // doublé d'un texte pour les lecteurs d'écran.
  await expect(page.getByRole("textbox", { name: /^Ton métier \(obligatoire\)/ })).toBeVisible();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();
  await expect(page.getByLabel("Ton métier")).toBeFocused();
  await expect(page.getByLabel("Ton métier")).toHaveAccessibleDescription(/Ce champ est obligatoire/);

  await page.getByLabel("Ton métier").fill("Graphiste");
  await page.getByLabel("Depuis combien de temps es-tu freelance ?").selectOption("lt1");
  await page.getByLabel("Combien de clients as-tu en ce moment ?").fill("0");
  // Aperçu du niveau, suivant le nombre de clients.
  await expect(page.getByTestId("level-preview").filter({ visible: true })).toContainText("Lancer");
  await page.getByLabel("Ton objectif de revenu mensuel").fill("1 500 000");
  await page.getByRole("button", { name: "Suivant" }).click();

  // Étape 2 : titre focalisé, métier repris, retour possible sans perte.
  await expect(page.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeFocused();
  await expect(page.getByText("Étape 2 / 3").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^Métier \(obligatoire\)/ })).toHaveValue("Graphiste");
  await page.getByLabel("Nom commercial").fill("Studio Hery");
  await page.getByRole("button", { name: "Précédent" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ton activité" })).toBeFocused();
  await expect(page.getByLabel("Ton objectif de revenu mensuel")).toHaveValue("1 500 000");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByLabel("Nom commercial")).toHaveValue("Studio Hery");

  // Rechargement : l'activité est enregistrée, le démarrage reprend à l'étape 2 et l'étape 1
  // garde ses réponses.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeVisible();
  await page.getByRole("button", { name: "Précédent" }).click();
  await expect(page.getByLabel("Ton objectif de revenu mensuel")).toHaveValue("1 500 000");
  await expect(page.getByLabel("Depuis combien de temps es-tu freelance ?")).toHaveValue("lt1");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeFocused();
  // Nom provisoire (le métier) jamais proposé comme nom commercial.
  await expect(page.getByLabel("Nom commercial")).toHaveValue("");
  await page.getByLabel("Nom commercial").fill("Studio Hery");
  await page.getByRole("textbox", { name: "Adresse (obligatoire)" }).fill("Lot II A 12, Antananarivo");

  // Image de marque : association « Prune », police « Moderne », aperçu mis à jour.
  await page.getByTestId("brand-preset-prune").filter({ visible: true }).click();
  await expect(page.getByLabel("Couleur principale", { exact: true })).toHaveValue("#5B2B5E");
  await page.getByTestId("brand-font-montserrat").filter({ visible: true }).click();
  const preview = page.getByTestId("brand-preview").filter({ visible: true });
  await expect(preview).toContainText("Studio Hery");
  await expect(preview).toHaveCSS("font-family", /Montserrat/);
  // Couleur principale illisible sur fond clair : refusée tout de suite, comme dans Réglages.
  await page.getByLabel("Couleur principale", { exact: true }).fill("#F5F5F5");
  await expect(page.getByText("Cette couleur est trop claire", { exact: false })).toBeVisible();
  await page.getByTestId("brand-preset-prune").filter({ visible: true }).click();

  // Faux PNG (texte annoncé image/png) : refusé par le serveur avant toute écriture,
  // le démarrage n'est pas terminé pour autant, les autres saisies sont conservées.
  await page.getByLabel("Logo (facultatif)").setInputFiles({
    name: "faux.png",
    mimeType: "image/png",
    buffer: Buffer.from("pas une image"),
  });
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("Le logo doit être une image PNG, JPEG ou WebP.")).toBeVisible();
  await expect(page.getByLabel("Nom commercial")).toHaveValue("Studio Hery");
  const probe = await page.context().newPage();
  await probe.goto("/fr/tableau-de-bord");
  await expect(probe).toHaveURL(/\/fr\/demarrage$/);
  await probe.close();

  await page.getByLabel("Logo (facultatif)").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Le logo doit être une image PNG, JPEG ou WebP.")).toHaveCount(0);
  await expect(preview.locator("img")).toHaveCount(1);
  await page.getByRole("button", { name: "Suivant" }).click();

  // Étape 3 : administratif, le plafond expliqué en une phrase.
  await expect(page.getByRole("heading", { level: 1, name: "Administratif" })).toBeFocused();
  await expect(page.getByTestId("onboarding-fiscal-limit").filter({ visible: true })).toHaveText("Tu peux envoyer jusqu'à 3 factures avant que ta carte soit vérifiée.");
  // Profil enregistré : l'application est déjà ouverte.
  const open = await page.context().newPage();
  await open.goto("/fr/tableau-de-bord");
  await expect(open).toHaveURL(/\/fr\/tableau-de-bord$/);
  await open.close();
  // Rechargement : reprise à l'étape 3 ; l'étape 2 garde le profil et la marque enregistrés.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Administratif" })).toBeVisible();
  await page.getByRole("button", { name: "Précédent" }).click();
  await expect(page.getByLabel("Nom commercial")).toHaveValue("Studio Hery");
  await expect(page.getByLabel("Couleur principale", { exact: true })).toHaveValue("#5B2B5E");
  await expect(page.getByLabel("Couleur d'accent", { exact: true })).toHaveValue("#D4A24C");
  await expect(page.getByTestId("brand-font-montserrat").filter({ visible: true }).locator("input")).toBeChecked();
  await expect(page.getByTestId("brand-preview").filter({ visible: true })).toHaveCSS("font-family", /Montserrat/);
  await expect(page.getByTestId("file-drop-logo").filter({ visible: true })).toContainText("Image actuelle");
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Administratif" })).toBeFocused();
  // Étape facultative : légende propre, « Plus tard » toujours possible.
  await expect(page.getByText("Obligatoires pour terminer. Sinon : Plus tard.").filter({ visible: true })).toBeVisible();

  // Onglets restés ouverts sur le démarrage (comme une page gardée en cache par le bouton
  // Retour), l'un sur l'étape 1, l'autre sur l'étape 2.
  const stale: Page[] = [];
  for (const back of [2, 1]) {
    const tab = await page.context().newPage();
    await tab.goto("/fr/demarrage?next=%2Ffactures");
    await expect(tab.getByRole("heading", { level: 1, name: "Administratif" })).toBeVisible();
    for (let i = 0; i < back; i++) await tab.getByRole("button", { name: "Précédent" }).click();
    stale.push(tab);
  }
  await expect(stale[0].getByRole("heading", { level: 1, name: "Ton activité" })).toBeFocused();
  await expect(stale[1].getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeFocused();

  // Terminer sans NIF : erreurs sur les champs obligatoires. « Plus tard » ne bloque pas et
  // garde les numéros déjà bien saisis (ici le NIF ; le STAT, incomplet, est laissé de côté).
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByLabel("NIF", { exact: false })).toBeFocused();
  await page.getByLabel("NIF", { exact: false }).fill("300 012 3456");
  await page.getByLabel("STAT", { exact: false }).fill("7411");
  await page.getByRole("button", { name: "Plus tard" }).click();

  // Retour à la page demandée avant la connexion.
  await expect(page).toHaveURL(/\/fr\/factures$/);
  const [ws] = (await (
    await adminRest(`workspaces?select=id,name,nif,stat&name=eq.${encodeURIComponent("Studio Hery")}&order=created_at.desc&limit=1`)
  ).json()) as { id: string; name: string; nif: string | null; stat: string | null }[];
  expect(ws).toMatchObject({ nif: "3000123456", stat: null });
  const completedAt = async () =>
    ((await (await adminRest(`onboarding_answers?select=completed_at&workspace_id=eq.${ws.id}`)).json()) as { completed_at: string | null }[])[0]
      .completed_at;
  expect(await completedAt()).not.toBeNull();

  // Démarrage terminé : un envoi depuis un onglet resté ouvert n'écrit rien (ni activité,
  // ni profil, ni fin du démarrage remise à zéro) et mène à la page demandée.
  await stale[0].getByLabel("Ton métier").fill("Pirate");
  await stale[0].getByRole("button", { name: "Suivant" }).click();
  await expect(stale[0]).toHaveURL(/\/fr\/factures$/);
  await stale[1].getByLabel("Nom commercial").fill("Studio Pirate");
  await stale[1].getByRole("button", { name: "Suivant" }).click();
  await expect(stale[1]).toHaveURL(/\/fr\/factures$/);
  for (const tab of stale) await tab.close();
  expect((await (await adminRest(`workspaces?select=name,trade&id=eq.${ws.id}`)).json())[0]).toEqual({ name: "Studio Hery", trade: "Graphiste" });
  expect(await completedAt()).not.toBeNull();

  // Tableau de bord : liste de démarrage du niveau Lancer, rien encore fait.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("link", { name: "Accueil" }).click();
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  await expect(page.getByRole("heading", { name: "Studio Hery" })).toBeVisible();
  await expect(page.getByText("Niveau : Lancer")).toBeVisible();
  const items = page.locator("[data-testid^=checklist-]");
  await expect(items).toHaveCount(4);
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
  // Données fiscales facultatives ici (nécessaires pour facturer) : le NIF gardé par
  // « Plus tard », le STAT encore vide.
  await expect(page.getByLabel("NIF", { exact: true })).toHaveValue("3000123456");
  await expect(page.getByLabel("STAT", { exact: true })).toHaveValue("");
  await expect(page.getByText("Facultatives pour l'instant, obligatoires pour émettre une facture", { exact: false })).toBeVisible();
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

test("Démarrage avant le chargement du JavaScript : étapes 1 et 2 en envoi classique, « Plus tard » garde les numéros", async ({ page }) => {
  const stamp = Date.now();
  const business = `Studio sans-js ${stamp}`;
  await page.goto("/fr/connexion");
  await signIn(page, `p1-sans-js-${stamp}@example.test`);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);

  // Fichiers JS de l'application bloqués : chaque étape part en POST classique, puis la
  // page se recharge à l'étape calculée par le serveur.
  const { plain, context } = await pageBeforeJavaScript(page);
  await plain.goto("/fr/demarrage");
  await expect(plain.getByRole("heading", { level: 1, name: "Ton activité" })).toBeVisible();
  await plain.getByLabel("Ton métier").fill("Traductrice");
  await plain.getByLabel("Depuis combien de temps es-tu freelance ?").selectOption("lt1");
  await plain.getByLabel("Combien de clients as-tu en ce moment ?").fill("0");
  await plain.getByLabel("Ton objectif de revenu mensuel").fill("800 000");
  await plain.getByRole("button", { name: "Suivant" }).click();
  await expect(plain).toHaveURL(/\/fr\/demarrage$/);

  // Étape 2 : champs obligatoires contrôlés par le navigateur (rien n'est envoyé) ; une
  // erreur du serveur (faux logo) est montrée après le rechargement, puis enregistrement.
  await expect(plain.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeVisible();
  await expect(plain.getByRole("textbox", { name: /^Métier \(obligatoire\)/ })).toHaveValue("Traductrice");
  await plain.getByRole("button", { name: "Suivant" }).click();
  expect(await plain.getByLabel("Nom commercial").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(plain.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeVisible();
  await plain.getByLabel("Nom commercial").fill(business);
  await plain.getByRole("textbox", { name: "Adresse (obligatoire)" }).fill("Lot II A 12, Antananarivo");
  await plain.getByLabel("Logo (facultatif)").setInputFiles({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("pas une image") });
  await plain.getByRole("button", { name: "Suivant" }).click();
  await expect(plain).toHaveURL(/\/fr\/demarrage\?erreur=check_answers$/);
  await expect(plain.getByText("Une réponse n'a pas pu être enregistrée. Vérifie cette étape et réessaie.")).toBeVisible();
  await plain.getByLabel("Nom commercial").fill(business);
  await plain.getByRole("textbox", { name: "Adresse (obligatoire)" }).fill("Lot II A 12, Antananarivo");
  await plain.getByRole("button", { name: "Suivant" }).click();

  // Étape 3 : « Plus tard » enregistre le NIF et le régime saisis, puis le tableau de bord.
  await expect(plain.getByRole("heading", { level: 1, name: "Administratif" })).toBeVisible();
  await plain.getByLabel("NIF", { exact: false }).fill("3000123456");
  await plain.getByLabel("Régime fiscal", { exact: false }).selectOption("tva");
  await plain.getByRole("button", { name: "Plus tard" }).click();
  await expect(plain).toHaveURL(/\/fr\/tableau-de-bord$/);
  await context.close();

  const [ws] = (await (
    await adminRest(`workspaces?select=id,trade,level,address,nif,stat,tax_regime,onboarded_at&name=eq.${encodeURIComponent(business)}`)
  ).json()) as { id: string; onboarded_at: string | null }[];
  expect(ws).toMatchObject({ trade: "Traductrice", level: "lancer", address: "Lot II A 12, Antananarivo", nif: "3000123456", stat: null, tax_regime: "tva" });
  expect(ws.onboarded_at).not.toBeNull();
  const [answers] = (await (await adminRest(`onboarding_answers?select=answers,completed_at&workspace_id=eq.${ws.id}`)).json()) as {
    answers: Record<string, unknown>;
    completed_at: string | null;
  }[];
  expect(answers.answers).toMatchObject({ trade: "Traductrice", current_clients: 0, monthly_income_goal: 800000 });
  expect(answers.completed_at).not.toBeNull();
});
