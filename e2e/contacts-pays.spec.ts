import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminRest, pageBeforeJavaScript, signUpAndOnboard } from "./helpers";

// Pays d'un contact : tous les pays, recherche sans accents ni casse (nom ou code),
// Madagascar puis les pays les plus utilisés par le workspace en tête ; liste native
// complète avant le chargement du JavaScript.
test("Pays du contact : recherche « japon », clavier, favoris dynamiques, repli sans JavaScript", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "pays");
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as {
    id: string;
  }[];

  await page.goto("/fr/contacts/nouveau");
  await expect(page.getByRole("button", { name: "Ajouter le contact" })).toBeEnabled();
  await page.getByLabel("Nom", { exact: true }).fill("Tanaka Yui");
  await page.getByLabel("E-mail").fill("yui@example.test");
  await page.getByText("Plus de détails (facultatif)").click();

  const country = page.getByRole("combobox", { name: "Pays" });
  await expect(country).toHaveValue("Madagascar");
  await expect(country).toHaveAttribute("aria-expanded", "false");

  // Sans contact : Madagascar, France, La Réunion, Maurice en tête, puis tous les pays.
  await country.click();
  await expect(country).toHaveAttribute("aria-expanded", "true");
  const listbox = page.getByRole("listbox", { name: "Pays" });
  const favourites = listbox.getByRole("group", { name: "Pays fréquents" }).getByRole("option");
  await expect(favourites).toHaveText(["Madagascar", "France", "La Réunion", "Maurice"]);
  await expect(listbox.getByRole("group", { name: "Tous les pays" }).getByRole("option")).toHaveCount(249);
  // Liste ouverte : accessible (WCAG 2.1 AA), rien ne déborde à 360 px.
  const { violations } = await new AxeBuilder({ page }).include("form").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Clavier : flèches, Fin, Début, Échap referme sans rien changer.
  await page.keyboard.press("ArrowDown");
  await expect(country).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("End");
  const lastId = await country.getAttribute("aria-activedescendant");
  await expect(page.locator(`[id="${lastId}"]`)).toHaveText("Zimbabwe");
  await page.keyboard.press("Home");
  await expect(page.locator(`[id="${await country.getAttribute("aria-activedescendant")}"]`)).toHaveText("Madagascar");
  await page.keyboard.press("Escape");
  await expect(country).toHaveAttribute("aria-expanded", "false");
  await expect(country).toHaveValue("Madagascar");

  // Recherche sans accent ni majuscule : « japon » → Japon, choisi avec Entrée (sans envoyer).
  await country.fill("japon");
  await expect(listbox.getByRole("option").first()).toHaveText("Japon");
  await expect(page.getByText("1 pays trouvé")).toBeAttached();
  await page.keyboard.press("Enter");
  await expect(country).toHaveValue("Japon");
  await expect(country).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/fr\/contacts\/nouveau$/);
  // Par le code, et accents ignorés : « REUNION », « cote d'iv ».
  await country.fill("REUNION");
  await expect(listbox.getByRole("option").first()).toHaveText("La Réunion");
  await country.fill("zzz");
  await expect(page.getByText("Aucun pays ne correspond.", { exact: false })).toBeVisible();
  await country.fill("jp");
  await listbox.getByRole("option", { name: "Japon" }).click();
  await expect(country).toHaveValue("Japon");

  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(page.getByRole("heading", { name: "Tanaka Yui" })).toBeVisible();
  const [saved] = (await (await adminRest(`contacts?select=country&workspace_id=eq.${ws}&name=eq.Tanaka%20Yui`)).json()) as {
    country: string;
  }[];
  expect(saved.country).toBe("JP");

  // Favoris dynamiques : Japon (1 contact) en tête, complété par la liste régionale.
  const withJapan = ["Madagascar", "Japon", "France", "La Réunion", "Maurice"];
  await page.goto("/fr/contacts/nouveau");
  await expect(page.getByRole("button", { name: "Ajouter le contact" })).toBeEnabled();
  await page.getByText("Plus de détails (facultatif)").click();
  await page.getByRole("combobox", { name: "Pays" }).click();
  await expect(page.getByRole("group", { name: "Pays fréquents" }).getByRole("option")).toHaveText(withJapan);
  // Pays choisi annoncé une seule fois, même s'il figure deux fois (fréquents et tous).
  await expect(page.getByRole("listbox", { name: "Pays" }).locator('[aria-selected="true"]')).toHaveText(["Madagascar"]);

  // Avant le chargement du JavaScript : liste native de tous les pays, favoris d'abord.
  const { plain, context } = await pageBeforeJavaScript(page);
  await plain.goto("/fr/contacts/nouveau");
  await plain.getByText("Plus de détails (facultatif)").click();
  const select = plain.getByRole("combobox", { name: "Pays" });
  await expect(select).toHaveValue("MG");
  await expect(select.locator('optgroup[label="Pays fréquents"] option')).toHaveText(withJapan);
  await expect(select.locator('optgroup[label="Tous les pays"] option')).toHaveCount(249);
  await select.selectOption("CA");
  await expect(select).toHaveValue("CA");
  await context.close();
});

// Saisie sans choix dans la liste : le pays désigné sans ambiguïté est enregistré, sinon
// un message le demande (jamais l'ancien pays en silence).
test("Pays du contact : nom tapé puis envoi direct, saisie ambiguë", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "pays-tape");
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as {
    id: string;
  }[];
  await page.goto("/fr/contacts/nouveau");
  await expect(page.getByRole("button", { name: "Ajouter le contact" })).toBeEnabled();
  await page.getByLabel("Nom", { exact: true }).fill("Sato Ken");
  await page.getByLabel("E-mail").fill("ken@example.test");
  await page.getByText("Plus de détails (facultatif)").click();
  const country = page.getByRole("combobox", { name: "Pays" });

  // Ambigu (« mal » : Mali, Malte, Malaisie…) : la saisie reste, avec un message.
  await country.fill("mal");
  await page.getByLabel("Étiquettes").click();
  await expect(country).toHaveValue("mal");
  await expect(page.locator(".text-danger", { hasText: "Choisis un pays dans la liste pour valider ta saisie." })).toBeVisible();
  await expect(country).toHaveAccessibleDescription(/Choisis un pays dans la liste pour valider ta saisie\./);
  await expect(page.locator('input[name="country"]')).toHaveValue("");

  // « japon » tapé, liste encore ouverte, envoi direct : Japon retenu.
  await country.fill("japon");
  await expect(country).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(page.getByRole("heading", { name: "Sato Ken" })).toBeVisible();
  const [saved] = (await (await adminRest(`contacts?select=country&workspace_id=eq.${ws}&name=eq.Sato%20Ken`)).json()) as {
    country: string;
  }[];
  expect(saved.country).toBe("JP");
});

// Connexion lente : pays choisi dans la liste native avant l'arrivée du JavaScript, gardé
// quand la recherche la remplace.
test("Pays du contact : choix fait avant le chargement du JavaScript, gardé ensuite", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "pays-3g");
  const [{ id: ws }] = (await (await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`)).json()) as {
    id: string;
  }[];
  const context = await page.context().browser()!.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 360, height: 780 },
    locale: "fr-FR",
    baseURL: new URL(page.url()).origin,
  });
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await context.route("**/_next/static/**/*.js", async (route) => {
    await released;
    await route.continue();
  });
  const slow = await context.newPage();
  await slow.goto("/fr/contacts/nouveau", { waitUntil: "domcontentloaded" });
  await slow.getByLabel("Nom", { exact: true }).fill("Yamada Aiko");
  await slow.getByLabel("E-mail").fill("aiko@example.test");
  await slow.getByText("Plus de détails (facultatif)").click();
  const select = slow.locator("select#country");
  await select.selectOption("JP");
  await expect(select).toHaveValue("JP");

  release();
  const country = slow.getByRole("combobox", { name: "Pays" });
  await expect(country).toHaveAttribute("aria-expanded", "false");
  await expect(country).toHaveValue("Japon");
  await expect(slow.locator('input[name="country"]')).toHaveValue("JP");
  await slow.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(slow.getByRole("heading", { name: "Yamada Aiko" })).toBeVisible();
  const [saved] = (await (await adminRest(`contacts?select=country&workspace_id=eq.${ws}&name=eq.Yamada%20Aiko`)).json()) as {
    country: string;
  }[];
  expect(saved.country).toBe("JP");
  await context.close();
});
