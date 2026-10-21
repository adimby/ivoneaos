import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminRest, signUpAndOnboard } from "./helpers";

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
