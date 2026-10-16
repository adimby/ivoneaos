import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import { adminRest } from "./helpers";
import { readOtp } from "./mailpit";

// Anglais : inscription et accueil guidé, puis les écrans principaux. Les textes attendus
// viennent de messages/en.json (pas de copie à tenir à jour ici).
// Clé manquante : next-intl affiche « Namespace.cle » à la place du texte.
const MISSING_KEY = /\b[A-Z][A-Za-z]+(\.[a-z][A-Za-z]*)+\b/;
// Libellés français de la navigation, absents d'une page en anglais.
const FRENCH = [fr.Nav.home, fr.Nav.invoices, fr.Nav.settings, fr.Nav.more];

async function expectEnglish(page: Page, heading: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: heading, exact: true }).filter({ visible: true }).first()).toBeVisible();
  const text = await page.locator("main").filter({ visible: true }).first().innerText();
  expect(text, `clé de traduction manquante sur ${page.url()}`).not.toMatch(MISSING_KEY);
  const nav = page.getByRole("navigation", { name: en.Nav.label });
  if (await nav.count()) {
    const navText = await nav.innerText();
    for (const word of FRENCH) expect(navText).not.toContain(word);
  }
  // Aucun libellé français resté dans la page (boutons d'action de la page publique).
  for (const word of [fr.Public.accept.button, fr.Public.download, fr.Public.payment.title]) {
    expect(text, `texte français sur ${page.url()}`).not.toContain(word);
  }
  // Rien ne déborde à 360 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
}

test("Anglais : inscription, accueil guidé et écrans principaux", async ({ page }) => {
  const stamp = Date.now();
  const email = `en-${stamp}@example.test`;
  const business = `Studio en ${stamp}`;

  await page.goto("/en");
  await expectEnglish(page, en.Home.title);
  await page.getByRole("link", { name: en.Home.cta }).click();
  await expect(page).toHaveURL(/\/en\/connexion$/);
  await expectEnglish(page, en.Auth.title);

  await page.getByLabel(en.Auth.emailLabel).fill(email);
  const since = new Date(Date.now() - 2_000);
  await page.getByRole("button", { name: en.Auth.sendCode }).click();
  await expect(page.getByRole("heading", { name: en.Auth.codeTitle })).toBeVisible();
  await page.getByLabel(en.Auth.codeLabel).fill(await readOtp(email, since));
  await page.getByRole("button", { name: en.Auth.verify }).click();

  await expect(page).toHaveURL(/\/en\/demarrage$/);
  await expectEnglish(page, en.Onboarding.step1.title);
  await page.getByLabel(en.Onboarding.trade.label).fill("Developer");
  await page.getByLabel(en.Onboarding.experience.label).selectOption("gt3");
  await page.getByLabel(en.Onboarding.clients.label).fill("3");
  await page.getByLabel(en.Onboarding.incomeGoal.label).fill("3000000");
  await page.getByRole("button", { name: en.Onboarding.next }).click();
  await expectEnglish(page, en.Onboarding.step2.title);
  await page.getByLabel(en.Profile.businessName.label).fill(business);
  await page.getByLabel(en.Profile.address.label, { exact: true }).fill("Lot II A 12, Antananarivo");
  await page.getByLabel(en.Profile.nif.label).fill("3000123456");
  await page.getByLabel(en.Profile.stat.label).fill("74111 11 2020 0 01234");
  await page.getByLabel(en.Profile.taxRegime.label).selectOption("tva");
  await page.getByRole("button", { name: en.Onboarding.submit }).click();

  await expect(page).toHaveURL(/\/en\/tableau-de-bord$/);
  await expectEnglish(page, business);
  await expect(page.getByRole("heading", { name: en.Dashboard.checklist.title })).toBeVisible();
  // Déjà des clients : niveau « Remplir son agenda », le paiement d'abord.
  await expect(page.locator("[data-testid^=checklist-]").first()).toContainText(en.Dashboard.items.papi.remplir.title);
  const nav = page.getByRole("navigation", { name: en.Nav.label });
  for (const label of [en.Nav.home, en.Nav.pipeline, en.Nav.invoices, en.Nav.more]) {
    await expect(nav.getByRole("link", { name: label }).or(nav.getByRole("button", { name: label }))).toBeVisible();
  }

  const screens: [string, string][] = [
    ["/en/pipeline", en.Deals.title],
    ["/en/pipeline/nouveau", en.Deals.newTitle],
    ["/en/factures", en.Billing.title],
    ["/en/contacts", en.Contacts.title],
    ["/en/contacts/nouveau", en.Contacts.newTitle],
    ["/en/reglages", en.Settings.title],
    ["/en/reglages/paiements", en.Payments.title],
    ["/en/reglages/offre", en.Plan.title],
  ];
  for (const [path, heading] of screens) {
    await page.goto(path);
    await expectEnglish(page, heading);
  }

  // Documents en anglais (client étranger), préparés directement en base : formulaire de
  // devis, détail de la facture, pages publiques vues par le client et PDF.
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as {
    id: string;
  }[];
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Jane Smith", email: "jane@example.test" });
  const sendDocument = async (table: "quotes" | "invoices", fk: "quote_id" | "invoice_id") => {
    const { id } = await insert<{ id: string }>(table, { workspace_id: ws, contact_id: contact.id, currency: "MGA", language: "en" });
    await insert("document_lines", { workspace_id: ws, [fk]: id, description: "Website", unit_price: 450000 });
    const sent = await adminRest(`${table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
    expect(sent.ok, await sent.clone().text()).toBe(true);
    const [doc] = (await (await adminRest(`${table}?select=number,public_token&id=eq.${id}`)).json()) as {
      number: string;
      public_token: string;
    }[];
    return { id, ...doc };
  };
  const quote = await sendDocument("quotes", "quote_id");
  const invoice = await sendDocument("invoices", "invoice_id");

  await page.goto("/en/devis/nouveau");
  await expectEnglish(page, en.Billing.form.newQuoteTitle);
  await page.goto(`/en/factures/${invoice.id}`);
  await expectEnglish(page, en.Billing.invoiceTitle.replace("{number}", invoice.number));

  // Page publique du devis : statut, accord et téléchargement en anglais.
  await page.goto(`/en/p/${quote.public_token}`);
  await expectEnglish(page, `${en.Pdf.quoteTitle} ${quote.number}`);
  await expect(page.getByText(en.Public.status.quote.sent)).toBeVisible();
  await expect(page.getByText(en.Public.accept.intro.split("{")[0])).toBeVisible();
  await expect(page.getByText(en.Public.accept.button, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.Public.download })).toBeVisible();

  // Page publique de la facture : montant à payer et moyens de paiement en anglais.
  await page.goto(`/en/p/${invoice.public_token}`);
  await expectEnglish(page, `${en.Pdf.invoiceTitle} ${invoice.number}`);
  await expect(page.getByText(en.Public.status.invoice.sent)).toBeVisible();
  await expect(page.getByRole("heading", { name: en.Public.payment.title })).toBeVisible();
  const pdf = await page.request.get(`/en/p/${invoice.public_token}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}
