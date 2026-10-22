import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminRest, signIn, signUpAndOnboard } from "./helpers";

// Accessibilité (WCAG 2.1 A et AA, axe-core) des écrans principaux à 360 px, remplis :
// libellés, contrastes, noms des boutons et liens, structure ; aucun débordement.
// Violations de la page, une ligne par règle (vide : rien à signaler).
async function violationsOf(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await expect(page.locator("main").filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const found = violations.map((v) => `${path} ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  // Rien ne déborde à 360 px (pas de défilement horizontal).
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width > 360) found.push(`${path} déborde : ${width} px de large`);
  return found;
}

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

test("Accessibilité des écrans principaux (fr) et de la page publique", async ({ page }) => {
  // Seize pages analysées par axe : plus long que le délai par défaut sur une machine chargée.
  test.setTimeout(120_000);
  const { business } = await signUpAndOnboard(page, "a11y");
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as { id: string }[];
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Rakoto Jean", phone: "+261341234567" });
  const [stage] = (await (await adminRest(`pipeline_stages?select=id&workspace_id=eq.${ws}&name=eq.call`)).json()) as { id: string }[];
  const deal = await insert<{ id: string }>("deals", { workspace_id: ws, contact_id: contact.id, stage_id: stage.id, title: "Logo", amount: 300000 });
  await insert("reminders", { workspace_id: ws, contact_id: contact.id, title: "Rappeler Rakoto", due_at: new Date().toISOString() });
  const invoice = await insert<{ id: string }>("invoices", { workspace_id: ws, contact_id: contact.id, currency: "MGA" });
  await insert("document_lines", { workspace_id: ws, invoice_id: invoice.id, description: "Logo", unit_price: 300000 });
  const sent = await adminRest(`invoices?id=eq.${invoice.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
  expect(sent.ok).toBe(true);
  const [{ public_token }] = (await (await adminRest(`invoices?select=public_token&id=eq.${invoice.id}`)).json()) as {
    public_token: string;
  }[];

  const report: string[] = [];
  for (const path of [
    "/fr/tableau-de-bord",
    "/fr/pipeline",
    `/fr/pipeline/${deal.id}`,
    "/fr/contacts",
    `/fr/contacts/${contact.id}`,
    "/fr/contacts/nouveau",
    "/fr/factures",
    `/fr/factures/${invoice.id}`,
    `/fr/devis/nouveau?contact=${contact.id}`,
    "/fr/reglages",
    "/fr/reglages/paiements",
    "/fr/reglages/offre",
    "/fr/reglages/apparence",
    "/fr/reglages/image-de-marque",
    "/fr/plus",
    `/fr/p/${public_token}`,
  ]) {
    report.push(...(await violationsOf(page, path)));
  }

  // Sans session : accueil et connexion.
  await page.context().clearCookies();
  report.push(...(await violationsOf(page, "/fr")), ...(await violationsOf(page, "/fr/connexion")));
  expect(report, report.join("\n")).toEqual([]);
});

// Palettes de l'application (src/modules/appearance/themes.ts), en clair et en sombre.
const PALETTES = ["ocean", "foret", "prune", "corail", "ardoise", "sable"];

// Une étape du démarrage, à 360 px puis à 1280 px (deux panneaux : la promesse à gauche) :
// axe complet (WCAG 2.1 A et AA) en Océan clair, puis contraste dans chaque palette, en
// clair et en sombre (attributs posés comme le fait le script de tête), sans débordement.
// Mouvement réduit (voir le test) : les couleurs changent sans transition avant chaque
// analyse.
async function onboardingViolations(page: Page, step: string): Promise<string[]> {
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  const found: string[] = [];
  const theme = (mode: string, palette: string) =>
    page.evaluate(([m, p]) => {
      document.documentElement.setAttribute("data-mode", m);
      document.documentElement.setAttribute("data-palette", p);
    }, [mode, palette]);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 800 });
    const at = `${step} ${width} px`;
    const format = (label: string, violations: { id: string; impact?: string | null; help: string; nodes: { target: unknown[] }[] }[]) =>
      violations.map((v) => `${at} ${label} ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    if (width === 1280) await expect(page.getByTestId("onboarding-promise")).toBeVisible();
    await theme("light", "ocean");
    found.push(...format("ocean.light", (await new AxeBuilder({ page }).withTags(tags).analyze()).violations));
    for (const palette of PALETTES) {
      for (const mode of ["light", "dark"]) {
        await theme(mode, palette);
        found.push(...format(`${palette}.${mode}`, (await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze()).violations));
      }
    }
    await theme("light", "ocean");
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scroll > width) found.push(`${at} déborde : ${scroll} px de large`);
  }
  await page.setViewportSize({ width: 360, height: 780 });
  return found;
}

test("Accessibilité du démarrage : chaque étape, erreurs comprises, à 360 et 1280 px, en clair, en sombre et dans les 6 palettes", async ({ page }) => {
  test.setTimeout(300_000);
  // Changements de palette sans transition : axe lit les couleurs finales.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const stamp = Date.now();
  await page.goto("/fr/connexion");
  await signIn(page, `a11y-demarrage-${stamp}@example.test`);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);
  const report: string[] = [];

  // Étape 1, avec les erreurs affichées.
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();
  report.push(...(await onboardingViolations(page, "étape 1")));
  await page.getByLabel("Ton métier").fill("Graphiste");
  await page.getByLabel("Depuis combien de temps es-tu freelance ?").selectOption("gt3");
  await page.getByLabel("Combien de clients as-tu en ce moment ?").fill("4");
  await page.getByLabel("Ton objectif de revenu mensuel").fill("3 000 000");
  await page.getByRole("button", { name: "Suivant" }).click();

  // Étape 2, avec les erreurs affichées.
  await expect(page.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeFocused();
  await page.getByRole("button", { name: "Suivant" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();
  report.push(...(await onboardingViolations(page, "étape 2")));
  await page.getByLabel("Nom commercial").fill(`Studio a11y ${stamp}`);
  await page.getByRole("textbox", { name: "Adresse (obligatoire)" }).fill("Lot II A 12, Antananarivo");
  await page.getByRole("button", { name: "Suivant" }).click();

  // Étape 3, avec les erreurs affichées.
  await expect(page.getByRole("heading", { level: 1, name: "Administratif" })).toBeFocused();
  report.push(...(await onboardingViolations(page, "étape 3")));
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByText("Ce champ est obligatoire.").first()).toBeVisible();
  report.push(...(await onboardingViolations(page, "étape 3 (erreurs)")));
  expect(report, report.join("\n")).toEqual([]);
});
