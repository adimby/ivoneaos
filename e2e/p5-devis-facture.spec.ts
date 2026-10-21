import { expect, test, type Page } from "@playwright/test";
import { adminRest, pageBeforeJavaScript, signUpAndOnboard } from "./helpers";

// Montants : Intl sépare les milliers par une espace insécable fine.
const money = (text: string) => new RegExp(text.replace(/ /g, "\\s"));
const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo", year: "numeric" }).format(new Date());

async function workspaceOf(business: string): Promise<string> {
  const found = await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`);
  const [{ id }] = (await found.json()) as { id: string }[];
  return id;
}

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

// Contact et opportunité à l'étape « Devis » (préparés directement, le parcours P3 est testé à part).
async function seedDeal(workspaceId: string) {
  const contact = await insert<{ id: string }>("contacts", {
    workspace_id: workspaceId,
    name: "Rakoto Jean",
    company_name: "Boutique Soa",
    phone: "+261341234567",
  });
  const stages = await adminRest(`pipeline_stages?select=id&workspace_id=eq.${workspaceId}&name=eq.quote`);
  const [stage] = (await stages.json()) as { id: string }[];
  return insert<{ id: string }>("deals", {
    workspace_id: workspaceId,
    contact_id: contact.id,
    stage_id: stage.id,
    title: "Identité visuelle",
    amount: 450000,
    currency: "MGA",
  });
}

async function expectPdf(page: Page, url: string) {
  const response = await page.request.get(url);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
}

test("P5 : opportunité → devis → envoi → J'accepte (client sans compte) → facture", async ({ page, browser }) => {
  // Sans NIF, STAT ni régime fiscal : le devis passe, la facture les demande avant l'envoi.
  const { business } = await signUpAndOnboard(page, "p5", { fiscal: false });
  const workspaceId = await workspaceOf(business);
  const deal = await seedDeal(workspaceId);

  // 1. Devis depuis l'opportunité : client prérempli et fixe.
  await page.goto(`/fr/pipeline/${deal.id}`);
  await page.getByRole("link", { name: "Créer un devis" }).click();
  await expect(page).toHaveURL(/\/fr\/devis\/nouveau\?deal=/);
  await expect(page.getByLabel("Client")).toHaveValue("Rakoto Jean (Boutique Soa)");
  await expect(page.getByLabel("Client")).not.toBeEditable();
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeEnabled();

  // Lignes : total en direct, ligne ajoutée puis retirée d'un geste.
  const lines = page.getByTestId("line");
  await lines.nth(0).getByLabel("Description").fill("Création du logo");
  await lines.nth(0).getByLabel("Prix unitaire (Ar)").fill("400 000");
  await expect(page.getByTestId("form-total")).toHaveText(money("400 000 Ar"));
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await expect(lines.nth(1).getByLabel("Description")).toBeFocused();
  await lines.nth(1).getByLabel("Description").fill("Cartes de visite");
  await lines.nth(1).getByLabel("Quantité").fill("2,5");
  await lines.nth(1).getByLabel("Prix unitaire (Ar)").fill("30 000");
  await expect(page.getByTestId("form-total")).toHaveText(money("475 000 Ar"));
  await page.getByRole("button", { name: "Ajouter une ligne" }).click();
  await page.getByRole("button", { name: "Retirer la ligne 3" }).click();
  await expect(lines).toHaveCount(2);
  await page.getByLabel("Remise (facultatif) (Ar)").fill("25 000");
  await expect(page.getByTestId("form-total")).toHaveText(money("450 000 Ar"));
  // Bouton principal en bas, à portée du pouce.
  const save = page.getByRole("button", { name: "Enregistrer le brouillon" });
  await expect(save).toBeInViewport();
  await save.click();

  await expect(page.getByRole("heading", { name: "Devis (brouillon)" })).toBeVisible();
  await expect(page.getByTestId("document-status").filter({ visible: true })).toHaveText("Brouillon");
  await expect(page.getByTestId("document-total").filter({ visible: true })).toHaveText(money("450 000 Ar"));
  const quoteUrl = page.url();
  const quoteId = quoteUrl.split("/").pop()!;

  // 2. Aperçu PDF (brouillon), puis envoi : numéro D-AAAA-0001 et lien court.
  await expectPdf(page, `/fr/devis/${quoteId}/apercu`);
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText("C'est envoyé ! Partage maintenant le lien avec ton client.")).toBeVisible();
  await expect(page.getByRole("heading", { name: `Devis D-${year}-0001` })).toBeVisible();
  await expect(page).toHaveTitle(`Devis D-${year}-0001 · Ivonea OS`);
  const publicUrl = await page.getByTestId("public-link").filter({ visible: true }).inputValue();
  expect(publicUrl).toMatch(/\/fr\/p\/[A-Za-z0-9_-]{32}$/);
  const whatsapp = await page.getByRole("link", { name: "Envoyer par WhatsApp" }).getAttribute("href");
  expect(whatsapp).toMatch(/^https:\/\/wa\.me\/261341234567\?text=/);
  expect(decodeURIComponent(whatsapp!.split("?text=")[1])).toContain(`voici le devis D-${year}-0001`);
  expect(decodeURIComponent(whatsapp!.split("?text=")[1])).toContain(publicUrl);
  await expectPdf(page, `${publicUrl}/pdf`);
  // Devis envoyé : WhatsApp est l'action principale (sous le pouce) ; « Marquer accepté »,
  // irréversible, demande une confirmation.
  await expect(page.getByRole("link", { name: "Envoyer par WhatsApp" })).toBeInViewport();
  await page.getByRole("button", { name: "Marquer accepté" }).click();
  const acceptDialog = page.getByRole("dialog", { name: "Marquer ce devis accepté ?" });
  await expect(acceptDialog).toBeVisible();
  await acceptDialog.getByRole("button", { name: "Retour" }).click();
  await expect(acceptDialog).toBeHidden();

  // 3. Le client ouvre le lien sans compte (nouveau contexte anonyme) et accepte.
  const client = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  const pub = await client.newPage();
  const response = await pub.goto(publicUrl);
  expect(response!.status()).toBe(200);
  // Jamais dans un cadre d'un autre site (anti-clickjacking sur « J'accepte »).
  const csp = response!.headers()["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response!.headers()["x-frame-options"]).toBe("DENY");
  // Ni script ni plugin d'un autre site ; le jeton du lien ne part pas vers un autre site.
  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).toContain("object-src 'none'");
  expect(response!.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response!.headers()["x-content-type-options"]).toBe("nosniff");
  await expect(pub.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(pub.getByRole("heading", { name: `Devis D-${year}-0001` })).toBeVisible();
  await expect(pub.getByTestId("public-total")).toHaveText(money("450 000 Ar"));
  await expect(pub.getByText("Création du logo")).toBeVisible();
  await expect(pub.getByText("Facturé avec Ivonea OS")).toBeVisible();
  await expect(pub.getByTestId("public-status")).toHaveText("En attente de votre accord");
  // Aucun catalogue de traductions de l'application n'est envoyé à la page publique.
  expect(await response!.text()).not.toContain("Enregistrer le brouillon");
  // Deux gestes : « J'accepte » ouvre la confirmation, « Pas maintenant » la referme.
  const accept = pub.getByTestId("accept").locator("summary");
  const confirm = pub.getByRole("button", { name: "Je confirme mon accord" });
  await expect(accept.getByText("J'accepte", { exact: true })).toBeVisible();
  await expect(accept).toBeInViewport();
  await expect(confirm).toBeHidden();
  await accept.click();
  await expect(pub.getByText(`Votre accord sur le devis D-${year}-0001 sera enregistré`, { exact: false })).toBeVisible();
  await expect(accept.getByText("Pas maintenant")).toBeVisible();
  await expect(accept.getByText("J'accepte", { exact: true })).toBeHidden();
  await accept.click();
  await expect(confirm).toBeHidden();
  await accept.click();
  await expect(confirm).toBeInViewport();
  await confirm.click();
  await expect(pub.getByText(/Merci ! Vous avez accepté ce devis le/)).toBeVisible();
  await expect(pub.getByTestId("public-status")).toHaveText("Accepté");
  await expect(pub.getByTestId("accept")).toHaveCount(0);
  // Un jeton inconnu ne révèle rien, et répond 404.
  const unknown = await pub.goto(`/fr/p/${"x".repeat(32)}`);
  expect(unknown!.status()).toBe(404);
  await expect(pub.getByRole("heading", { name: "Document introuvable" })).toBeVisible();
  await expect(pub).toHaveTitle("Document introuvable · Ivonea OS");
  await expect(pub.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
  await client.close();

  // 4. Côté freelance : devis accepté, opportunité gagnée, « Transformer en facture ». Le
  // bloc « Avant ta première facture » est déjà proposé, sans bloquer la transformation.
  await page.reload();
  await expect(page.getByTestId("document-status").filter({ visible: true })).toHaveText("Accepté");
  await expect(page.getByTestId("fiscal-block").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "Transformer en facture" }).click();
  await expect(page).toHaveURL(/\/fr\/factures\/[0-9a-f-]{36}\?ok=converted$/);
  await expect(page.getByText("Facture créée depuis le devis.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Facture (brouillon)" })).toBeVisible();
  await expect(page.getByTestId("document-total").filter({ visible: true })).toHaveText(money("450 000 Ar"));
  await expect(page.getByText("Création du logo").filter({ visible: true }).first()).toBeVisible();
  const invoiceId = new URL(page.url()).pathname.split("/").pop()!;

  // Nouvelle facture : le bloc fiscal est replié (le brouillon s'enregistre sans lui) et
  // n'éloigne pas l'action principale, toujours sous le pouce.
  await page.goto("/fr/factures/nouvelle");
  const compact = page.getByTestId("fiscal-block").filter({ visible: true });
  await expect(compact.getByRole("heading", { name: "Avant ta première facture" })).toBeVisible();
  await expect(compact.getByLabel("NIF", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeInViewport();
  await compact.getByRole("heading", { name: "Avant ta première facture" }).click();
  await expect(compact.getByLabel("NIF", { exact: true })).toBeVisible();
  await page.goto(`/fr/factures/${invoiceId}`);

  // 5. Avant la première facture : NIF, STAT et régime fiscal à la place du bouton d'envoi.
  const fiscal = page.getByTestId("fiscal-block").filter({ visible: true });
  await expect(fiscal.getByRole("heading", { name: "Avant ta première facture" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Envoyer la facture" })).toHaveCount(0);
  // Connexion lente, JavaScript pas encore chargé : bloc et champs déjà là, saisissables ;
  // l'enregistrement attend le JavaScript (un envoi natif d'action serveur afficherait une
  // page blanche), comme les autres formulaires de l'application.
  const { plain, context } = await pageBeforeJavaScript(page);
  await plain.goto(`/fr/factures/${invoiceId}`);
  await expect(plain.getByRole("heading", { name: "Avant ta première facture" })).toBeVisible();
  await plain.getByLabel("NIF", { exact: true }).fill("3000123456");
  await expect(plain.getByLabel("NIF", { exact: true })).toHaveValue("3000123456");
  await expect(plain.getByRole("button", { name: "Enregistrer mes infos fiscales" })).toBeDisabled();
  await context.close();
  // Avec JavaScript : erreur sur place, saisies gardées, puis correction.
  await fiscal.getByLabel("NIF", { exact: true }).fill("300012345");
  await fiscal.getByLabel("STAT", { exact: true }).fill("74111 11 2020 0 01234");
  await fiscal.getByLabel("Régime fiscal").selectOption("impot_synthetique");
  await fiscal.getByRole("button", { name: "Enregistrer mes infos fiscales" }).click();
  await expect(fiscal.getByText("Le NIF compte 10 chiffres.")).toBeVisible();
  await expect(fiscal.getByLabel("NIF", { exact: true })).toBeFocused();
  await expect(fiscal.getByLabel("STAT", { exact: true })).toHaveValue("74111 11 2020 0 01234");
  await expect(page.getByRole("button", { name: "Envoyer la facture" })).toHaveCount(0);
  await fiscal.getByLabel("NIF", { exact: true }).fill("300 012 3456");
  await fiscal.getByRole("button", { name: "Enregistrer mes infos fiscales" }).click();
  await expect(page.getByTestId("fiscal-saved").filter({ visible: true })).toHaveText(
    "Infos fiscales enregistrées. Tu peux émettre ta facture.",
  );
  await expect(page.getByTestId("fiscal-block").filter({ visible: true })).toHaveCount(0);
  // Brouillon intact, envoi de retour.
  await expect(page.getByRole("heading", { name: "Facture (brouillon)" })).toBeVisible();
  await expect(page.getByTestId("document-total").filter({ visible: true })).toHaveText(money("450 000 Ar"));
  await expect(page.getByText("Cartes de visite").filter({ visible: true }).first()).toBeVisible();
  const [saved] = (await (await adminRest(`workspaces?select=nif,stat,tax_regime,profile_completed_at&name=eq.${encodeURIComponent(business)}`)).json()) as {
    nif: string;
    stat: string;
    tax_regime: string;
    profile_completed_at: string | null;
  }[];
  expect(saved).toMatchObject({ nif: "3000123456", stat: "74111112020001234", tax_regime: "impot_synthetique" });
  expect(saved.profile_completed_at).not.toBeNull();

  // Réglages : données fiscales complètes, corrigeables mais plus effaçables.
  await page.goto("/fr/reglages");
  await expect(page.getByText("tu peux les corriger, pas les effacer", { exact: false })).toBeVisible();
  await page.getByLabel("NIF", { exact: true }).fill("");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Ce champ est obligatoire.")).toBeVisible();
  await expect(page.getByLabel("NIF", { exact: true })).toBeFocused();
  await page.goto(`/fr/factures/${invoiceId}`);

  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByRole("heading", { name: `Facture F-${year}-0001` })).toBeVisible();
  await expect(page.getByTestId("document-status").filter({ visible: true })).toHaveText("Envoyée");
  await expectPdf(page, `/fr/factures/${invoiceId}/apercu`);
  const invoiceLink = await page.getByTestId("public-link").filter({ visible: true }).inputValue();
  await expectPdf(page, `${invoiceLink}/pdf?telecharger`);

  // La liste « Factures » la montre ; l'opportunité est gagnée.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("link", { name: "Factures" }).click();
  await expect(page.getByTestId("document-card").filter({ visible: true }).first()).toContainText(`F-${year}-0001`);
  await page.goto(`/fr/pipeline/${deal.id}`);
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Gagné");

  // Paiement reçu en direct : « Marquer payée ».
  await page.goto(`/fr/factures/${invoiceId}`);
  await page.getByRole("button", { name: "Marquer payée" }).click();
  const dialog = page.getByRole("dialog", { name: "Marquer la facture payée ?" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reçu par").selectOption("MVOLA");
  await dialog.getByRole("button", { name: "Confirmer le paiement" }).click();
  await expect(page.getByText("Facture marquée payée.")).toBeVisible();
  await expect(page.getByTestId("document-status").filter({ visible: true })).toHaveText("Payée");
});

test("Facture en euros (taux, coordonnées manuelles) et limite Découverte au 4e envoi du mois", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p5-limite");
  const workspaceId = await workspaceOf(business);
  const contact = await insert<{ id: string }>("contacts", { workspace_id: workspaceId, name: "Jane Smith", email: "jane@example.test" });
  await insert("payment_accounts", {
    workspace_id: workspaceId,
    provider: "manual",
    manual_instructions: "RIB : 00005000011234567890123\nIBAN FR76 3000 6000 0112 3456 7890 189",
  });
  // Deux devis déjà envoyés ce mois-ci.
  for (let i = 0; i < 2; i++) {
    const quote = await insert<{ id: string }>("quotes", { workspace_id: workspaceId, contact_id: contact.id });
    await insert("document_lines", { workspace_id: workspaceId, quote_id: quote.id, description: "Prestation", unit_price: 100000 });
    const sent = await adminRest(`quotes?id=eq.${quote.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
    expect(sent.ok).toBe(true);
  }

  // 3e document du mois : facture en euros, taux vers l'ariary obligatoire.
  await page.goto(`/fr/factures/nouvelle?contact=${contact.id}`);
  // Champs contrôlés par React : attendre l'hydratation (bouton activé) avant de saisir.
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeEnabled();
  await page.getByLabel("Devise").selectOption("EUR");
  await page.getByLabel("Langue du document").selectOption("en");
  const line = page.getByTestId("line").first();
  await line.getByLabel("Description").fill("Website design");
  await line.getByLabel("Quantité").fill("3");
  await line.getByLabel("Prix unitaire (€)").fill("120,50");
  await expect(page.getByTestId("form-total")).toHaveText(money("361,50 €"));
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page.getByText("Ce champ est obligatoire.")).toBeVisible();
  await page.getByLabel("Taux de change vers MGA").fill("5 000");
  await expect(page.getByText(money("Soit environ 1 807 500 Ar."))).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page.getByRole("heading", { name: "Facture (brouillon)" })).toBeVisible();
  await expect(page.getByText(money("Soit environ 1 807 500 Ar au taux de 5 000."))).toBeVisible();
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  await expect(page.getByRole("heading", { name: `Facture F-${year}-0001` })).toBeVisible();

  // Page publique en anglais (langue du document) : coordonnées de paiement manuelles.
  const invoiceLink = await page.getByTestId("public-link").filter({ visible: true }).inputValue();
  expect(invoiceLink).toMatch(/\/en\/p\//);
  await page.goto(invoiceLink);
  await expect(page.getByRole("heading", { name: `Invoice F-${year}-0001` })).toBeVisible();
  await expect(page.getByTestId("manual-payment")).toContainText("RIB : 00005000011234567890123");
  await expect(page.getByTestId("manual-payment")).toContainText("IBAN FR76 3000 6000 0112 3456 7890 189");
  await expect(page.getByTestId("pay-online")).toHaveCount(0);

  // 4e document du mois : refusé côté serveur, message clair, le devis reste brouillon.
  await page.goto(`/fr/devis/nouveau?contact=${contact.id}`);
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeEnabled();
  await page.getByTestId("line").first().getByLabel("Description").fill("Logo");
  await page.getByTestId("line").first().getByLabel("Prix unitaire (Ar)").fill("200 000");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText("Tu as envoyé 3 devis ou factures ce mois-ci", { exact: false })).toBeVisible();
  await expect(page.getByTestId("plan-limit-link").filter({ visible: true })).toHaveAttribute("href", "/fr/reglages/offre");
  await expect(page.getByRole("heading", { name: "Devis (brouillon)" })).toBeVisible();
});
