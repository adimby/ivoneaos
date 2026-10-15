import { expect, test } from "@playwright/test";
import { adminRest, openMore, pageBeforeJavaScript, signIn, signUpAndOnboard } from "./helpers";

// Montants : Intl sépare les milliers par une espace insécable fine.
const money = (text: string) => new RegExp(text.replace(/ /g, "\\s"));

test("P3 : contact → opportunité → étape suivante → note", async ({ page }) => {
  const { email } = await signUpAndOnboard(page, "p3");

  // Contacts (menu Plus) : liste vide.
  await openMore(page, "Plus");
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/contacts$/);
  await expect(page.getByText("Aucun contact pour l'instant")).toBeVisible();

  // Nouveau contact : envoi vide refusé par le serveur, focus sur le premier champ en
  // erreur, message visible au-dessus de la barre d'action collante.
  await page.getByRole("link", { name: "Nouveau contact" }).click();
  await expect(page).toHaveURL(/\/fr\/contacts\/nouveau$/);
  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(page.getByLabel("Nom", { exact: true })).toBeFocused();
  const nameError = page.getByText("Ce champ est obligatoire.");
  await expect(nameError).toBeInViewport();
  const errorBox = (await nameError.boundingBox())!;
  const barBox = (await page.getByRole("button", { name: "Ajouter le contact" }).boundingBox())!;
  expect(errorBox.y + errorBox.height).toBeLessThan(barBox.y);
  await expect(page.getByText("Indique un téléphone ou un e-mail pour pouvoir joindre ce contact.")).toBeVisible();

  await page.getByLabel("Nom", { exact: true }).fill("Rakoto Jean");
  await page.getByLabel("Téléphone").fill("034 12 345 67");
  await page.getByLabel("Entreprise (facultatif)").fill("Boutique Soa");

  // Session expirée pendant la saisie : l'action serveur n'est pas cassée par le proxy,
  // elle renvoie vers la connexion puis vers le formulaire.
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion\?next=(%2F|\/)contacts(%2F|\/)nouveau$/);
  await page.waitForTimeout(1_100);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/fr\/contacts\/nouveau$/);

  await page.getByLabel("Nom", { exact: true }).fill("Rakoto Jean");
  await page.getByLabel("Téléphone").fill("034 12 345 67");
  await page.getByLabel("Entreprise (facultatif)").fill("Boutique (Soa), Analakely");
  await page.getByRole("button", { name: "Ajouter le contact" }).click();

  // Fiche : numéro normalisé, appel et WhatsApp en un geste.
  await expect(page.getByRole("heading", { name: "Rakoto Jean" })).toBeVisible();
  await expect(page.getByText("+261 34 12 345 67")).toBeVisible();
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute("href", "tel:+261341234567");
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/261341234567");

  // Opportunité depuis le contact (contact prérempli).
  await page.getByRole("link", { name: "Nouvelle opportunité" }).click();
  await expect(page.getByLabel("Contact")).toHaveValue(/[0-9a-f-]{36}/);
  // Gagné et perdu ne se choisissent pas à la création (confirmation depuis l'opportunité).
  await expect(page.getByLabel("Étape").locator("option")).toHaveText(["Prospect", "Contacté", "Appel", "Devis"]);
  await page.getByLabel("Titre").fill("Logo boutique");
  await page.getByLabel("Montant estimé (facultatif)").fill("450 000");
  await page.getByRole("button", { name: "Créer l'opportunité" }).click();
  await expect(page.getByRole("heading", { name: "Logo boutique" })).toBeVisible();
  await expect(page.getByText(money("450 000 Ar"))).toBeVisible();
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Prospect");

  // Pipeline : la carte est dans « Prospect », avec le total de l'étape.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("link", { name: "Pipeline" }).click();
  const prospect = page.getByTestId("stage-prospect").filter({ visible: true });
  await expect(prospect.getByTestId("deal-card")).toContainText("Logo boutique");
  await expect(prospect.getByTestId("stage-total")).toHaveText(money("450 000 Ar"));
  await prospect.getByTestId("deal-card").click();
  // Navigation client terminée avant de lire l'URL (sinon c'est encore /pipeline).
  await expect(page).toHaveURL(/\/fr\/pipeline\/[0-9a-f-]{36}$/);

  // Étape suivante : formulaire simple, utilisable avant le chargement du JavaScript.
  const { plain, context } = await pageBeforeJavaScript(page);
  await plain.goto(page.url());
  await plain.getByRole("button", { name: "Étape suivante : Contacté" }).click();
  await expect(plain.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Contacté");
  await context.close();
  await page.reload();
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Contacté");

  // Modifier : pas de champ étape (gagné et perdu passent par la confirmation).
  await page.getByRole("link", { name: "Modifier" }).click();
  await expect(page.getByLabel("Titre")).toHaveValue("Logo boutique");
  await expect(page.getByLabel("Étape").filter({ visible: true })).toHaveCount(0);
  // Le contact ne change pas : affiché en lecture seule.
  await expect(page.getByLabel("Contact")).toHaveValue("Rakoto Jean (Boutique (Soa), Analakely)");
  await expect(page.getByLabel("Contact")).not.toBeEditable();
  await page.getByRole("link", { name: "Retour à l'opportunité" }).click();

  // « Gagné » demande confirmation.
  await page.getByRole("button", { name: "Passer à l'étape Gagné" }).click();
  const dialog = page.getByRole("dialog", { name: "Marquer comme gagnée ?" });
  await expect(dialog).toBeVisible();
  // Focus sur « Annuler » : Entrée ne confirme pas par mégarde.
  await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Contacté");
  await page.getByRole("button", { name: "Passer à l'étape Gagné" }).click();
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Contacté");
  await page.getByRole("button", { name: "Passer à l'étape Gagné" }).click();
  await dialog.getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Gagné");
  await expect(page.getByRole("button", { name: /Étape suivante/ })).toHaveCount(0);

  // Note d'échange sur l'opportunité : en tête de l'historique.
  await page.getByRole("form", { name: "Noter un échange" }).getByText("Appel", { exact: true }).click();
  await page.getByLabel("Ce qui s'est dit").fill("Client ravi, facture à préparer.");
  await page.getByRole("button", { name: "Ajouter à l'historique" }).click();
  await expect(page.getByText("Ajouté à l'historique.")).toBeVisible();
  await expect(page.getByTestId("timeline").filter({ visible: true }).locator("li").first()).toContainText("Client ravi, facture à préparer.");
  await expect(page.getByTestId("timeline").filter({ visible: true }).locator("li").first()).toContainText("Appel");
  await expect(page.getByLabel("Ce qui s'est dit")).toHaveValue("");

  // Opportunité archivée : consultation seule (étape, rappels, échanges figés).
  const dealUrl = page.url();
  await page.getByRole("button", { name: "Archiver cette opportunité" }).click();
  await expect(page).toHaveURL(/\/fr\/pipeline\?archive=/);
  await page.goto(dealUrl);
  await expect(page.getByRole("heading", { name: "Logo boutique" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Changer d'étape" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Me rappeler" })).toHaveCount(0);
  await expect(page.getByRole("form", { name: "Noter un échange" })).toHaveCount(0);
  await expect(page.getByTestId("timeline").filter({ visible: true })).toContainText("Client ravi, facture à préparer.");
  await page.getByRole("button", { name: "Désarchiver" }).click();
  await expect(page.getByRole("heading", { name: "Changer d'étape" })).toBeVisible();

  // Historique du contact : la note, liée à l'opportunité.
  await page.getByRole("link", { name: "Rakoto Jean" }).click();
  await expect(page.getByTestId("timeline").filter({ visible: true })).toContainText("Client ravi, facture à préparer.");
  await expect(page.getByTestId("timeline").filter({ visible: true })).toContainText("Opportunité : Logo boutique");

  // Archiver, puis annuler.
  await page.getByRole("button", { name: "Archiver ce contact" }).click();
  await expect(page).toHaveURL(/\/fr\/contacts\?archive=/);
  await expect(page.getByText("Rakoto Jean est archivé.")).toBeVisible();
  await expect(page.getByText("Aucun contact pour l'instant")).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Rakoto Jean" })).toBeVisible();

  // Recherche par numéro saisi au format national, et par entreprise avec parenthèses et
  // virgule (cherchées telles quelles).
  await page.goto("/fr/contacts?q=034%2012");
  await expect(page.getByRole("link", { name: /Rakoto Jean/ })).toBeVisible();
  await page.goto(`/fr/contacts?q=${encodeURIComponent("(Soa), Anala")}`);
  await expect(page.getByRole("link", { name: /Rakoto Jean/ })).toBeVisible();
  await page.goto("/fr/contacts?q=inconnu");
  await expect(page.getByText("Aucun contact ne correspond à « inconnu ».")).toBeVisible();
});

test("Offre Découverte : le 21e contact actif est refusé avec un message clair", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "limite");
  const found = await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`);
  const [{ id: workspaceId }] = (await found.json()) as { id: string }[];
  const created = await adminRest("contacts", {
    method: "POST",
    body: JSON.stringify(
      Array.from({ length: 20 }, (_, i) => ({ workspace_id: workspaceId, name: `Contact ${i + 1}`, email: `c${i + 1}@example.test` })),
    ),
  });
  expect(created.ok).toBe(true);

  await page.goto("/fr/contacts/nouveau");
  await page.getByLabel("Nom", { exact: true }).fill("Vingt et unième");
  await page.getByLabel("E-mail").fill("21@example.test");
  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(
    page.getByText("Tu as 20 contacts actifs, la limite de l'offre Découverte.", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/contacts\/nouveau$/);
});
