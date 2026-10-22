import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { adminRest, signUpAndOnboard } from "./helpers";

// P3.3 : glisser-déposer des cartes du pipeline entre colonnes (ordinateur et tablette).
// Le bouton « Étape suivante » et le choix d'une étape restent l'alternative au clavier,
// au lecteur d'écran et au téléphone.

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1180 };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const money = (text: string) => new RegExp(text.replace(/ /g, "\\s"));

type Seeded = { stages: Record<string, string>; deals: Record<string, string> };

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

// Compte avec trois opportunités : deux en « Prospect », une en « Contacté ».
async function seed(page: Page, prefix: string): Promise<Seeded> {
  const { business } = await signUpAndOnboard(page, prefix);
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as { id: string }[];
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Rakoto Jean", phone: "+261341234567" });
  const rows = (await (await adminRest(`pipeline_stages?select=id,name&workspace_id=eq.${ws}`)).json()) as { id: string; name: string }[];
  const stages = Object.fromEntries(rows.map((s) => [s.name, s.id]));
  const deals: Record<string, string> = {};
  for (const [title, stage, amount] of [
    ["Site vitrine", "prospect", 100000],
    ["Contrat LinkedIn", "prospect", 450000],
    ["Logo boutique", "contacted", 200000],
  ] as const) {
    deals[title] = (await insert<{ id: string }>("deals", { workspace_id: ws, contact_id: contact.id, stage_id: stages[stage], title, amount })).id;
  }
  await page.goto("/fr/pipeline");
  await expect(page.getByTestId("deal-card")).toHaveCount(3);
  return { stages, deals };
}

async function stageOf(dealId: string): Promise<string> {
  const [{ stage_id }] = (await (await adminRest(`deals?select=stage_id&id=eq.${dealId}`)).json()) as { stage_id: string }[];
  return stage_id;
}

const column = (page: Page, name: string) => page.getByTestId(`stage-${name}`);
const card = (scope: Page | Locator, title: string) => scope.getByTestId("deal-card").filter({ hasText: title });

// Glisser à la souris : appui, quelques pixels pour lancer le glisser, puis dépôt au point visé.
async function drag(page: Page, from: Locator, to: { x: number; y: number }, beforeDrop?: () => Promise<void>) {
  await expect(from).toBeVisible();
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await beforeDrop?.();
  await page.mouse.up();
}

// Page diffusée en flux : le contenu arrive d'abord masqué, attendre qu'il soit affiché.
async function centerOf(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("ordinateur (1440 × 900)", () => {
  test.use({ viewport: DESKTOP, isMobile: false, hasTouch: false });

  test("glisser de Prospect à Contacté : déplacée aussitôt, nombres et totaux à jour, enregistrée", async ({ page }) => {
    const { stages, deals } = await seed(page, "dnd");
    const prospect = column(page, "prospect");
    const contacted = column(page, "contacted");
    await expect(prospect.getByTestId("stage-count")).toContainText("2 opportunités");
    await expect(contacted.getByTestId("stage-count")).toContainText("1 opportunité");

    // Colonne survolée mise en évidence pendant le glisser.
    await drag(page, card(prospect, "Contrat LinkedIn"), await centerOf(contacted), async () => {
      await expect(contacted).toHaveAttribute("data-over", "true");
      await expect(prospect).not.toHaveAttribute("data-over");
    });

    // Glisser n'ouvre pas la carte ; la carte, les nombres et les totaux changent aussitôt.
    await expect(page).toHaveURL(/\/fr\/pipeline$/);
    await expect(card(contacted, "Contrat LinkedIn")).toBeVisible();
    await expect(card(prospect, "Contrat LinkedIn")).toHaveCount(0);
    await expect(prospect.getByTestId("stage-count")).toContainText("1 opportunité");
    await expect(prospect.getByTestId("stage-total")).toHaveText(money("100 000 Ar"));
    await expect(contacted.getByTestId("stage-count")).toContainText("2 opportunités");
    await expect(contacted.getByTestId("stage-total")).toHaveText(money("650 000 Ar"));
    await expect(page.getByTestId("pipeline-announcement")).toHaveText("Contrat LinkedIn déplacé vers Contacté");

    // En base, et toujours là après rechargement.
    await expect.poll(() => stageOf(deals["Contrat LinkedIn"])).toBe(stages.contacted);
    await page.reload();
    await expect(card(column(page, "contacted"), "Contrat LinkedIn")).toBeVisible();
    await expect(column(page, "contacted").getByTestId("stage-total")).toHaveText(money("650 000 Ar"));

    // Déposée hors d'une colonne : rien ne change.
    await drag(page, card(column(page, "contacted"), "Logo boutique"), await centerOf(page.getByRole("heading", { level: 1 })));
    await expect(card(column(page, "contacted"), "Logo boutique")).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/pipeline$/);
    expect(await stageOf(deals["Logo boutique"])).toBe(stages.contacted);

    // Accessibilité (axe) du pipeline après les déplacements.
    const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(violations.map((v) => `${v.id} : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test("glisser vers Gagné : même confirmation et mêmes effets que le bouton", async ({ page }) => {
    const { stages, deals } = await seed(page, "dndwon");
    const won = column(page, "won");

    // Annuler : la carte reste à sa place.
    await drag(page, card(column(page, "prospect"), "Contrat LinkedIn"), await centerOf(won));
    const dialog = page.getByRole("dialog", { name: "Marquer comme gagnée ?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused();
    await page.waitForTimeout(100);
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
    await expect(card(column(page, "prospect"), "Contrat LinkedIn")).toBeVisible();
    expect(await stageOf(deals["Contrat LinkedIn"])).toBe(stages.prospect);

    // Confirmer : gagnée, comme avec « Passer à l'étape Gagné ».
    await drag(page, card(column(page, "prospect"), "Contrat LinkedIn"), await centerOf(won));
    await expect(dialog.getByRole("button", { name: "Annuler" })).toBeFocused();
    // @dnd-kit ignore les clics 50 ms encore après un dépôt (pas de clic fantôme) : un humain
    // ne confirme pas aussi vite, le test attend comme lui.
    await page.waitForTimeout(100);
    await dialog.getByRole("button", { name: "Confirmer" }).click();
    await expect(card(won, "Contrat LinkedIn")).toBeVisible();
    await expect(won.getByTestId("stage-total")).toHaveText(money("450 000 Ar"));
    await expect.poll(() => stageOf(deals["Contrat LinkedIn"])).toBe(stages.won);
    await card(won, "Contrat LinkedIn").click();
    await expect(page).toHaveURL(new RegExp(`/fr/pipeline/${deals["Contrat LinkedIn"]}$`));
    await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Gagné");
    await expect(page.getByRole("button", { name: /Étape suivante/ })).toHaveCount(0);
  });

  test("un clic ouvre la carte ; au clavier, la carte et « Étape suivante » marchent toujours", async ({ page }) => {
    const { stages, deals } = await seed(page, "dndclick");
    await card(column(page, "prospect"), "Site vitrine").click();
    await expect(page).toHaveURL(new RegExp(`/fr/pipeline/${deals["Site vitrine"]}$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/fr\/pipeline$/);

    // Clavier : la carte reste un lien (Entrée l'ouvre), puis « Étape suivante ».
    const link = card(column(page, "prospect"), "Site vitrine");
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/fr/pipeline/${deals["Site vitrine"]}$`));
    const next = page.getByRole("button", { name: "Étape suivante : Contacté" }).filter({ visible: true });
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Contacté");
    await expect.poll(() => stageOf(deals["Site vitrine"])).toBe(stages.contacted);
  });

  test("réseau coupé ou refus du serveur : la carte revient, message clair", async ({ page }) => {
    const { stages, deals } = await seed(page, "dnderr");
    const prospect = column(page, "prospect");
    const contacted = column(page, "contacted");

    for (const failure of ["abort", "refused"] as const) {
      await page.route("**/fr/pipeline", (route) => {
        if (route.request().method() !== "POST") return route.continue();
        return failure === "abort" ? route.abort("internetdisconnected") : route.fulfill({ status: 500, body: "refus" });
      });
      await drag(page, card(prospect, "Contrat LinkedIn"), await centerOf(contacted));
      const alert = page.getByRole("alert").filter({ hasText: "La carte Contrat LinkedIn n'a pas pu être déplacée" });
      await expect(alert).toBeVisible();
      await expect(alert).toContainText("Elle est restée dans Prospect.");
      await expect(card(prospect, "Contrat LinkedIn")).toBeVisible();
      await expect(card(contacted, "Contrat LinkedIn")).toHaveCount(0);
      await expect(prospect.getByTestId("stage-count")).toContainText("2 opportunités");
      await expect(contacted.getByTestId("stage-count")).toContainText("1 opportunité");
      expect(await stageOf(deals["Contrat LinkedIn"])).toBe(stages.prospect);
      await page.unroute("**/fr/pipeline");
    }

    // Réseau lent (2 s) : la carte change de colonne sans attendre la réponse, et le geste
    // réussit en effaçant le message.
    await page.route("**/fr/pipeline", async (route) => {
      if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await drag(page, card(prospect, "Contrat LinkedIn"), await centerOf(contacted));
    await expect(card(contacted, "Contrat LinkedIn")).toBeVisible({ timeout: 1000 });
    await expect(contacted.getByTestId("stage-count")).toContainText("2 opportunités", { timeout: 1000 });
    await expect(page.getByRole("alert").filter({ hasText: "n'a pas pu être déplacée" })).toHaveCount(0);
    await expect.poll(() => stageOf(deals["Contrat LinkedIn"])).toBe(stages.contacted);
  });
});

// Tactile : un appui long (250 ms) saisit la carte ; un glissement rapide fait défiler.
async function touchDrag(page: Page, from: Locator, to: Locator, holdMs: number) {
  const cdp = await page.context().newCDPSession(page);
  const a = await centerOf(from);
  const b = await centerOf(to);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await touch("touchStart", a);
  await page.waitForTimeout(holdMs);
  for (let i = 1; i <= 12; i++) await touch("touchMove", { x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 });
  await touch("touchEnd");
  await cdp.detach();
}

test.describe("tablette (820 × 1180)", () => {
  test.use({ viewport: TABLET, isMobile: true, hasTouch: true });

  test("appui long puis glisser : déplacée ; sans appui long, rien ne bouge", async ({ page }) => {
    const { stages, deals } = await seed(page, "dndtab");
    await expect(page.locator("[data-draggable]")).toHaveCount(3);
    const prospect = column(page, "prospect");
    const contacted = column(page, "contacted");

    // Glissement immédiat : c'est un défilement, pas un glisser-déposer.
    await touchDrag(page, card(prospect, "Contrat LinkedIn"), contacted, 0);
    await expect(card(prospect, "Contrat LinkedIn")).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/pipeline$/);
    expect(await stageOf(deals["Contrat LinkedIn"])).toBe(stages.prospect);

    await page.evaluate(() => document.querySelector("[data-testid=pipeline-board]")!.scrollTo(0, 0));
    await touchDrag(page, card(prospect, "Contrat LinkedIn"), contacted, 400);
    await expect(card(contacted, "Contrat LinkedIn")).toBeVisible();
    await expect(contacted.getByTestId("stage-count")).toContainText("2 opportunités");
    // Raccourcis d'étape (tablette) à jour aussi.
    await expect(page.getByRole("navigation", { name: "Étapes du pipeline" }).getByRole("link", { name: /Contacté/ })).toContainText("2");
    await expect.poll(() => stageOf(deals["Contrat LinkedIn"])).toBe(stages.contacted);
  });
});

test("téléphone (360 px) : pas de glisser-déposer, « Étape suivante » depuis l'opportunité", async ({ page }) => {
  const { stages, deals } = await seed(page, "dndphone");
  const prospect = column(page, "prospect");
  await expect(page.locator("[data-draggable]")).toHaveCount(0);
  await touchDrag(page, card(prospect, "Contrat LinkedIn"), page.getByRole("heading", { level: 1 }), 400);
  await page.waitForTimeout(500);
  expect(await stageOf(deals["Contrat LinkedIn"])).toBe(stages.prospect);
  await expect(card(prospect, "Contrat LinkedIn")).toBeVisible();
});
