import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { adminRest, onboardToAdminStep, signIn, signUpAndOnboard } from "./helpers";

// Mise en page ordinateur (1440 × 900), petits portables (1024 × 768, 1280 × 800,
// 1366 × 768) et tablette (820 × 1180) ; le téléphone (360 px) reste couvert par les autres
// parcours. Navigation de gauche sur ordinateur, barre d'onglets en dessous ; aucun
// défilement horizontal ; accessibilité (axe) sur ordinateur et tablette.
// E2E_SCREENSHOTS_DIR=<dossier hors du dépôt> : captures des écrans principaux à 360, 820,
// 1024, 1280, 1366 et 1440 px, pour juger le rendu à l'œil.

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1180 };
const LAPTOPS = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const NAV = "Navigation principale";

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

// Compte rempli : contacts, une opportunité par étape ouverte, un rappel, une facture et un
// devis envoyés. Renvoie les pages principales à parcourir.
async function seed(page: Page, prefix: string) {
  const { business } = await signUpAndOnboard(page, prefix);
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as { id: string }[];
  const contact = await insert<{ id: string }>("contacts", {
    workspace_id: ws,
    name: "Rakoto Jean",
    phone: "+261341234567",
    company_name: "Boutique Soa",
    tags: ["client", "boutique"],
  });
  await insert("contacts", { workspace_id: ws, name: "Hanta Rasoa", email: "hanta@example.test", company_name: "Studio Hanta" });
  const stages = (await (await adminRest(`pipeline_stages?select=id,name&workspace_id=eq.${ws}&order=position`)).json()) as {
    id: string;
    name: string;
  }[];
  let deal = "";
  for (const [i, stage] of stages.filter((s) => s.name !== "won" && s.name !== "lost").entries()) {
    const row = await insert<{ id: string }>("deals", {
      workspace_id: ws,
      contact_id: contact.id,
      stage_id: stage.id,
      title: `Identité visuelle ${i + 1}`,
      amount: 450000 * (i + 1),
    });
    deal ||= row.id;
  }
  // Montant démesuré et titre long : le pire cas pour une colonne étroite du kanban.
  await insert("deals", {
    workspace_id: ws,
    contact_id: contact.id,
    stage_id: stages[0].id,
    title: "Refonte complète du site e-commerce et de la boutique en ligne",
    amount: 123456789012,
  });
  await insert("reminders", { workspace_id: ws, contact_id: contact.id, title: "Rappeler Rakoto", due_at: new Date().toISOString() });
  const send = async (table: "quotes" | "invoices", fk: "quote_id" | "invoice_id") => {
    const { id } = await insert<{ id: string }>(table, { workspace_id: ws, contact_id: contact.id, currency: "MGA" });
    await insert("document_lines", { workspace_id: ws, [fk]: id, description: "Logo et charte graphique", unit_price: 450000 });
    const sent = await adminRest(`${table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) });
    expect(sent.ok, await sent.clone().text()).toBe(true);
    const [{ public_token }] = (await (await adminRest(`${table}?select=public_token&id=eq.${id}`)).json()) as { public_token: string }[];
    return { id, public_token };
  };
  const invoice = await send("invoices", "invoice_id");
  const quote = await send("quotes", "quote_id");
  return {
    contact: contact.id,
    paths: [
      "/fr/tableau-de-bord",
      "/fr/pipeline",
      `/fr/pipeline/${deal}`,
      "/fr/contacts",
      `/fr/contacts/${contact.id}`,
      "/fr/contacts/nouveau",
      "/fr/factures",
      "/fr/factures?vue=devis",
      `/fr/factures/${invoice.id}`,
      `/fr/devis/${quote.id}`,
      `/fr/devis/nouveau?contact=${contact.id}`,
      "/fr/reglages",
      "/fr/reglages/paiements",
      "/fr/reglages/offre",
      `/fr/p/${invoice.public_token}`,
      `/fr/p/${quote.public_token}`,
    ],
  };
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main").filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
}

// Largeur du document au-delà de la fenêtre (0 : pas de défilement horizontal).
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("ordinateur (1440 × 900)", () => {
  test.use({ viewport: DESKTOP, isMobile: false, hasTouch: false });

  test("navigation de gauche, pipeline en colonnes, aucun débordement, accessibilité", async ({ page }) => {
    test.setTimeout(180_000);
    const { paths } = await seed(page, "desk");

    // Une seule navigation principale exposée : celle de gauche ; ni barre d'onglets ni en-tête.
    const nav = page.getByRole("navigation", { name: NAV });
    await expect(nav).toHaveCount(1);
    await expect(page.getByTestId("side-nav")).toBeVisible();
    await expect(page.getByTestId("bottom-nav")).toBeHidden();
    await expect(page.getByRole("banner")).toBeHidden();
    await expect(nav.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("button", { name: "Plus" })).toHaveCount(0);

    // Tableau de bord : les blocs côte à côte (deux colonnes).
    const collected = (await page.getByTestId("dash-collected").boundingBox())!;
    const pending = (await page.getByTestId("dash-pending").boundingBox())!;
    expect(Math.abs(collected.y - pending.y)).toBeLessThan(2);
    expect(pending.x).toBeGreaterThan(collected.x + collected.width);
    // Pas de marge réservée à une barre d'onglets en bas.
    const main = page.locator("main").filter({ visible: true }).first();
    expect(await main.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))).toBeLessThan(64);

    // Lien d'évitement : premier arrêt du clavier (page fraîchement chargée), il mène au contenu.
    await open(page, "/fr/tableau-de-bord");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Aller au contenu principal" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(main).toBeFocused();

    // Chaque entrée mène à sa page et devient l'entrée active.
    for (const [name, url] of [
      ["Pipeline", /\/fr\/pipeline$/],
      ["Devis et factures", /\/fr\/factures$/],
      ["Contacts", /\/fr\/contacts$/],
      ["Réglages", /\/fr\/reglages$/],
      ["Tableau de bord", /\/fr\/tableau-de-bord$/],
    ] as const) {
      await nav.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
      await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
      await expect(nav.locator("[aria-current=page]")).toHaveCount(1);
    }
    // Un devis reste dans « Devis & factures ».
    await page.goto(paths.find((p) => p.startsWith("/fr/devis/") && !p.includes("nouveau"))!);
    await expect(nav.getByRole("link", { name: "Devis et factures" })).toHaveAttribute("aria-current", "page");

    // Pipeline : les 6 étapes visibles côte à côte, sans raccourcis ni barre du bas.
    await open(page, "/fr/pipeline");
    const columns = page.getByTestId("pipeline-board").filter({ visible: true }).locator(":scope > section");
    await expect(columns).toHaveCount(6);
    const boxes = await columns.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
    for (const box of boxes) {
      expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(2);
      expect(box.x + box.width).toBeLessThanOrEqual(DESKTOP.width);
    }
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x);
    await expect(page.getByRole("navigation", { name: "Étapes du pipeline" })).toBeHidden();
    await expect(page.getByRole("link", { name: "Nouvelle opportunité" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Nouvelle opportunité" })).toBeInViewport();

    // Opportunité : « Étape suivante » une seule fois, sous le choix d'étape.
    await open(page, paths[2]);
    await expect(page.getByRole("button", { name: /^Étape suivante/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Étape suivante/ })).toBeInViewport();

    // Écrans principaux : rien ne déborde, aucune violation axe (WCAG 2.1 A et AA).
    const report: string[] = [];
    for (const path of paths) {
      await open(page, path);
      const extra = await overflow(page);
      if (extra > 0) report.push(`${path} déborde de ${extra} px`);
      const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      report.push(...violations.map((v) => `${path} ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
    }

    // Langue changée depuis la navigation de gauche : même page, mêmes paramètres.
    await open(page, "/fr/factures?vue=devis");
    await page.getByTestId("side-nav").getByRole("button", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/factures\?vue=devis$/);
    await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Quotes and invoices" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Quotes", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByTestId("side-nav").getByRole("button", { name: "Français" }).click();
    await expect(page).toHaveURL(/\/fr\/factures\?vue=devis$/);

    await page.context().clearCookies();
    for (const path of ["/fr", "/fr/connexion"]) {
      await open(page, path);
      const extra = await overflow(page);
      if (extra > 0) report.push(`${path} déborde de ${extra} px`);
      const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      report.push(...violations.map((v) => `${path} ${v.id} (${v.impact}) : ${v.help}`));
    }
    expect(report, report.join("\n")).toEqual([]);
  });
});

// Petits portables : là où la place manque le plus à côté de la navigation de gauche.
test.describe("petits portables (1024, 1280 et 1366 px)", () => {
  test.use({ viewport: LAPTOPS[0], isMobile: false, hasTouch: false });

  test("pipeline entier visible, lignes du devis lisibles, numéros entiers, aucun débordement", async ({ page }) => {
    test.setTimeout(240_000);
    const { paths, contact } = await seed(page, "laptop");
    const report: string[] = [];
    for (const viewport of LAPTOPS) {
      await page.setViewportSize(viewport);
      const at = `${viewport.width} px`;

      // Pipeline : les 6 étapes dans la fenêtre, sans défilement caché dans le tableau ;
      // côte à côte à partir de 1280 px, 3 × 2 en dessous.
      await open(page, "/fr/pipeline");
      await expect(page.getByTestId("side-nav")).toBeVisible();
      const board = page.getByTestId("pipeline-board");
      const { scroll, client } = await board.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      if (scroll > client) report.push(`${at} pipeline : le tableau défile (${scroll} > ${client})`);
      const boxes = await board.locator(":scope > section").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
      expect(boxes).toHaveLength(6);
      for (const box of boxes) if (box.x < 0 || box.x + box.width > viewport.width) report.push(`${at} pipeline : une étape sort de l'écran`);
      const rows = new Set(boxes.map((box) => Math.round(box.y))).size;
      if (rows !== (viewport.width >= 1280 ? 1 : 2)) report.push(`${at} pipeline : ${rows} rangée(s)`);
      // Montant démesuré : il reste dans sa carte.
      for (const card of await page.getByTestId("deal-card").all()) {
        const fits = await card.evaluate((el) => el.scrollWidth <= el.clientWidth);
        if (!fits) report.push(`${at} pipeline : une carte déborde`);
      }

      // Devis : la description d'une ligne reste un vrai champ, sans libellés superposés.
      await open(page, `/fr/devis/nouveau?contact=${contact}`);
      const description = page.getByLabel("Description").first();
      const width = (await description.boundingBox())!.width;
      if (width < 200) report.push(`${at} devis : description large de ${width} px`);
      const line = page.getByTestId("line").first();
      const labels = await line.locator("label").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const [a, b] = [labels[i], labels[j]];
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
          if (overlap) report.push(`${at} devis : libellés superposés`);
        }

      // Listes de documents : le numéro n'est jamais coupé.
      for (const path of ["/fr/factures", "/fr/factures?vue=devis"]) {
        await open(page, path);
        const numbers = page.getByTestId("document-card").first().getByText(/^[DF]-\d{4}-\d{4}$/).filter({ visible: true });
        await expect(numbers).toHaveCount(1);
        if (!(await numbers.evaluate((el) => el.scrollWidth <= el.clientWidth))) report.push(`${at} ${path} : numéro coupé`);
      }

      for (const path of paths) {
        await open(page, path);
        const extra = await overflow(page);
        if (extra > 0) report.push(`${at} ${path} déborde de ${extra} px`);
      }
    }
    expect(report, report.join("\n")).toEqual([]);
  });
});

test.describe("tablette (820 × 1180)", () => {
  test.use({ viewport: TABLET, isMobile: true, hasTouch: true });

  test("onglets en bas, contenu élargi, aucun débordement, accessibilité", async ({ page }) => {
    test.setTimeout(120_000);
    const { paths } = await seed(page, "tab");

    await expect(page.getByRole("navigation", { name: NAV })).toHaveCount(1);
    await expect(page.getByTestId("bottom-nav")).toBeVisible();
    await expect(page.getByTestId("side-nav")).toBeHidden();
    // Plus de colonne de 448 px : le contenu occupe la largeur de la tablette.
    const main = page.locator("main").filter({ visible: true }).first();
    expect((await main.boundingBox())!.width).toBeGreaterThan(700);

    const report: string[] = [];
    for (const path of paths) {
      await open(page, path);
      const extra = await overflow(page);
      if (extra > 0) report.push(`${path} déborde de ${extra} px`);
      const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      report.push(...violations.map((v) => `${path} ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
    }
    expect(report, report.join("\n")).toEqual([]);
  });
});

test("captures d'écran 360, 820, 1024, 1280, 1366 et 1440 px (E2E_SCREENSHOTS_DIR)", async ({ page }) => {
  const dir = process.env.E2E_SCREENSHOTS_DIR;
  test.skip(!dir, "E2E_SCREENSHOTS_DIR non défini");
  test.setTimeout(600_000);
  mkdirSync(dir!, { recursive: true });
  await page.setViewportSize(DESKTOP);
  const { paths } = await seed(page, "shots");
  const shots = [...paths, "/fr/plus"];
  for (const viewport of [{ width: 360, height: 780 }, TABLET, ...LAPTOPS, DESKTOP]) {
    await page.setViewportSize(viewport);
    for (const path of shots) {
      await open(page, path);
      const name = path.replace(/^\/fr\/?/, "").replace(/[/?=]+/g, "_").replace(/_[0-9a-f-]{20,}/g, "_id") || "accueil";
      await page.screenshot({ path: join(dir!, `${viewport.width}-${name}.png`), fullPage: true });
    }
  }
  await page.context().clearCookies();
  for (const viewport of [{ width: 360, height: 780 }, TABLET, DESKTOP]) {
    await page.setViewportSize(viewport);
    for (const path of ["/fr", "/fr/connexion"]) {
      await open(page, path);
      await page.screenshot({ path: join(dir!, `${viewport.width}-public${path.replace(/\//g, "_")}.png`), fullPage: true });
    }
  }
  // Accueil guidé (nouveau compte, pas encore accueilli).
  await page.goto("/fr/connexion");
  await signIn(page, `shots-onboarding-${Date.now()}@example.test`);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);
  for (const viewport of [{ width: 360, height: 780 }, TABLET, DESKTOP]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
    await page.screenshot({ path: join(dir!, `${viewport.width}-demarrage.png`), fullPage: true });
  }
});

// Démarrage en 3 étapes : deux panneaux sur ordinateur (promesse à gauche, formulaire à
// droite, indicateur complet), carte sur tablette, une colonne et indicateur compact sur
// téléphone ; aucun débordement, accessibilité (axe) de chaque étape sur ordinateur.
// Captures 360 et 1280 px, en clair et en sombre, de chaque étape (E2E_SCREENSHOTS_DIR).
test.describe("démarrage (360, 820 et 1280 px)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test("deux panneaux sur ordinateur, indicateur d'étapes, aucun débordement, accessibilité", async ({ page }) => {
    test.setTimeout(180_000);
    const dir = process.env.E2E_SCREENSHOTS_DIR;
    if (dir) mkdirSync(dir, { recursive: true });
    const stamp = Date.now();
    await page.goto("/fr/connexion");
    await signIn(page, `demarrage-ecrans-${stamp}@example.test`);
    await expect(page).toHaveURL(/\/fr\/demarrage$/);
    const report: string[] = [];

    // Captures et contrôles de l'étape affichée, aux trois largeurs, en clair puis en sombre.
    async function check(step: number) {
      for (const viewport of [{ width: 360, height: 780 }, TABLET, { width: 1280, height: 800 }]) {
        await page.setViewportSize(viewport);
        const at = `étape ${step} ${viewport.width} px`;
        const promise = page.getByTestId("onboarding-promise");
        const stepper = page.getByTestId("onboarding-stepper");
        const current = stepper.locator("[aria-current=step]").filter({ visible: true });
        await expect(current).toHaveCount(1);
        if (viewport.width >= 1024) {
          await expect(promise).toBeVisible();
          // Formulaire à droite de la promesse.
          const left = (await promise.boundingBox())!;
          const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
          if (title.x < left.x + left.width) report.push(`${at} : formulaire pas à droite de la promesse`);
          await expect(page.getByTestId("onboarding-step-pill")).toHaveText(`Étape ${step} / 3`);
          await expect(current).toContainText(`Étape ${step}`);
        } else {
          await expect(promise).toBeHidden();
        }
        if (viewport.width < 768) await expect(page.getByText(`Étape ${step} / 3`).filter({ visible: true })).toBeVisible();
        else {
          // Indicateur complet : chaque nom d'étape sur une ligne, liaisons de même largeur.
          const layout = await stepper.evaluate((nav) => ({
            lines: [...nav.querySelectorAll<HTMLElement>("[data-step-name]")].map(
              (el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
            ),
            connectors: [...nav.querySelectorAll<HTMLElement>("[data-connector]")].map((el) => el.getBoundingClientRect().width),
          }));
          if (layout.lines.some((lines) => lines > 1.5)) report.push(`${at} : nom d'étape sur plusieurs lignes`);
          const [a, b] = layout.connectors;
          if (!(a >= 16 && Math.abs(a - b) <= 1)) report.push(`${at} : liaisons inégales (${layout.connectors.join(", ")} px)`);
        }
        const extra = await overflow(page);
        if (extra > 0) report.push(`${at} déborde de ${extra} px`);
        if (viewport.width === 1280) {
          const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          report.push(...violations.map((v) => `${at} ${v.id} (${v.impact}) : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
        }
        if (dir && viewport.width !== TABLET.width) {
          for (const mode of ["light", "dark"]) {
            await page.evaluate((m) => document.documentElement.setAttribute("data-mode", m), mode);
            // Fin des transitions de couleur avant la capture.
            await page.waitForTimeout(300);
            await page.screenshot({ path: join(dir, `demarrage-${step}-${viewport.width}-${mode}.png`), fullPage: true });
          }
          await page.evaluate(() => document.documentElement.setAttribute("data-mode", "light"));
        }
      }
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    await check(1);
    await onboardToAdminStep(page, `Studio ecrans ${stamp}`);
    await check(3);
    // Étape 2 (retour) : profil et marque enregistrés.
    await page.getByRole("button", { name: "Précédent" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ton profil et ta marque" })).toBeFocused();
    // Ordinateur : étapes faites cochées, ligne de liaison colorée.
    const steps = page.getByTestId("onboarding-stepper").locator("ol").filter({ visible: true }).locator("li");
    await expect(steps.nth(0)).toContainText("terminée");
    await expect(steps.nth(1)).toHaveAttribute("aria-current", "step");
    await expect(steps.nth(2)).not.toContainText("terminée");
    await check(2);
    expect(report, report.join("\n")).toEqual([]);
  });
});
