import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminRest, pageBeforeJavaScript, signUpAndOnboard } from "./helpers";

// Personnalisation (docs/spec-mvp.md) : apparence de l'application (mode, palette) et
// image de marque des devis et factures (PDF et page client).

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

// PNG uni (RGB 8 bits) : logo et bannière de test, lisibles par le moteur PDF.
function png(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const htmlTheme = (page: Page) =>
  page.evaluate(() => `${document.documentElement.getAttribute("data-mode")}.${document.documentElement.getAttribute("data-palette")}`);

test("Apparence : sombre + Forêt, gardée au rechargement sans éclair, sans JavaScript, accessible", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { business } = await signUpAndOnboard(page, "theme");
  const ws = await workspaceOf(business);

  // Par défaut : Océan clair, l'aspect d'origine.
  expect(await bodyBackground(page)).toBe("rgb(232, 237, 240)");

  await page.goto("/fr/reglages");
  await page.getByTestId("settings-appearance").click();
  await expect(page.getByRole("heading", { name: "Apparence", level: 1 })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Clair/ })).toBeChecked();
  await page.getByRole("radio", { name: /Sombre/ }).check();
  await page.getByTestId("palette-foret").click();
  await page.getByRole("button", { name: "Enregistrer l'apparence" }).click();
  await expect(page.getByText("Apparence enregistrée.")).toBeVisible();
  expect(await htmlTheme(page)).toBe("dark.foret");
  // Fond Forêt sombre (#0d1a13), barre du navigateur à la couleur de la palette.
  expect(await bodyBackground(page)).toBe("rgb(13, 26, 19)");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#103322");
  expect((await page.context().cookies()).find((c) => c.name === "ivn_apparence")?.value).toBe("dark.foret");

  // Rechargement : attributs posés avant la première peinture (premier rAF).
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      (window as unknown as { __firstPaint: string }).__firstPaint =
        `${document.documentElement.getAttribute("data-mode")}.${document.documentElement.getAttribute("data-palette")}`;
    });
  });
  await page.goto("/fr/tableau-de-bord");
  await expect(page.locator("main").filter({ visible: true }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __firstPaint: string }).__firstPaint)).toBe("dark.foret");
  // HTML du serveur : le script de tête lit le cookie (coquille statique, aucun thème en dur).
  const html = await (await page.request.get("/fr/tableau-de-bord")).text();
  expect(html).toContain("__ivnApplyAppearance");
  expect(html).toContain("ivn_apparence");

  // Avant le chargement du JavaScript (connexion lente) : le script de tête suffit.
  const slow = await pageBeforeJavaScript(page);
  await slow.plain.goto("/fr/reglages/apparence");
  await expect(slow.plain.getByRole("heading", { name: "Apparence", level: 1 })).toBeVisible();
  expect(await htmlTheme(slow.plain)).toBe("dark.foret");
  expect(await bodyBackground(slow.plain)).toBe("rgb(13, 26, 19)");
  await slow.context.close();

  // JavaScript désactivé : feuille /apparence.css (noscript) d'après le cookie.
  const noJs = await browser.newContext({
    storageState: await page.context().storageState(),
    javaScriptEnabled: false,
    viewport: { width: 360, height: 780 },
    baseURL: new URL(page.url()).origin,
  });
  const plain = await noJs.newPage();
  await plain.goto("/fr/reglages/apparence");
  expect(await bodyBackground(plain)).toBe("rgb(13, 26, 19)");
  await noJs.close();

  // Autre appareil (cookie absent) : le profil fait foi, le cookie est reposé.
  await page.context().clearCookies({ name: "ivn_apparence" });
  await page.goto("/fr/contacts");
  await expect.poll(() => htmlTheme(page)).toBe("dark.foret");
  expect((await page.context().cookies()).find((c) => c.name === "ivn_apparence")?.value).toBe("dark.foret");

  // Enregistrement refusé : l'apparence affichée reste celle du profil.
  await page.goto("/fr/reglages/apparence");
  await page.getByRole("radio", { name: /Clair/ }).check();
  await page.getByTestId("palette-prune").click();
  await page.getByTestId("palette-prune").locator("input").evaluate((input: HTMLInputElement) => (input.value = "inconnue"));
  await page.getByRole("button", { name: "Enregistrer l'apparence" }).click();
  await expect(page.getByText("L'apparence n'a pas pu être enregistrée. Réessaie.")).toBeVisible();
  expect(await htmlTheme(page)).toBe("dark.foret");
  expect(await bodyBackground(page)).toBe("rgb(13, 26, 19)");

  // Page client d'un document : jamais au thème de la freelance.
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Rakoto Jean", phone: "+261341234567" });
  const quote = await insert<{ id: string }>("quotes", { workspace_id: ws, contact_id: contact.id, currency: "MGA" });
  await insert("document_lines", { workspace_id: ws, quote_id: quote.id, description: "Logo", unit_price: 300000 });
  expect((await adminRest(`quotes?id=eq.${quote.id}`, { method: "PATCH", body: JSON.stringify({ status: "sent" }) })).ok).toBe(true);
  const [{ public_token }] = (await (await adminRest(`quotes?select=public_token&id=eq.${quote.id}`)).json()) as { public_token: string }[];
  await page.goto(`/fr/p/${public_token}`);
  await expect(page.getByTestId("public-total")).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("[data-palette]")!).backgroundColor)).toBe("rgb(232, 237, 240)");
  // Police Classique (par défaut) servie par le site, comme dans le PDF : pas de repli Roboto.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].some((f) => f.family.replaceAll('"', "") === "Ivonea Classique" && f.status === "loaded");
      }),
    )
    .toBe(true);

  // Accessibilité en mode sombre (WCAG 2.1 AA, contrastes compris), captures pour revue.
  const report: string[] = [];
  for (const path of [
    "/fr/tableau-de-bord",
    "/fr/pipeline",
    "/fr/contacts",
    `/fr/contacts/${contact.id}`,
    "/fr/factures",
    `/fr/devis/${quote.id}`,
    "/fr/reglages",
    "/fr/reglages/apparence",
    "/fr/reglages/image-de-marque",
    "/fr/plus",
  ]) {
    await page.goto(path);
    await expect(page.locator("main").filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    report.push(...violations.map((v) => `${path} ${v.id} : ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
    await page.screenshot({ path: test.info().outputPath(`sombre${path.replaceAll("/", "-")}.png`), fullPage: true });
  }
  expect(report, report.join("\n")).toEqual([]);

  // Déconnexion (appareil partagé) : l'écran de connexion revient à Océan clair, sans
  // rechargement, et le cookie de cet appareil est effacé.
  await page.goto("/fr/plus");
  await page.getByRole("button", { name: "Se déconnecter" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/fr\/connexion/);
  await expect.poll(() => htmlTheme(page)).toBe("light.ocean");
  expect(await bodyBackground(page)).toBe("rgb(232, 237, 240)");
  expect((await page.context().cookies()).find((c) => c.name === "ivn_apparence")).toBeUndefined();
});

test("Image de marque : police, couleurs, logo masqué, bannière → devis envoyé, page client et PDF", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const { business } = await signUpAndOnboard(page, "marque");
  const ws = await workspaceOf(business);

  // Logo du profil (pour vérifier qu'il peut être masqué).
  await page.goto("/fr/reglages");
  await page.getByLabel("Logo (facultatif)").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png(120, 120, [1, 81, 90]) });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Profil enregistré.")).toBeVisible();

  await page.getByTestId("settings-branding").click();
  await expect(page.getByRole("heading", { name: "Image de marque", level: 1 })).toBeVisible();
  const save = page.getByRole("button", { name: "Enregistrer l'image de marque" });
  await expect(save).toBeEnabled();

  // Couleur principale trop claire : refusée avec un message clair.
  const primary = page.getByLabel("Couleur principale", { exact: true });
  await primary.fill("#F2C14E");
  await expect(page.getByText("Cette couleur est trop claire pour des titres lisibles")).toBeVisible();
  await save.click();
  await expect(page.getByText("Cette couleur est trop claire pour des titres lisibles")).toBeVisible();
  await expect(page.getByText("Image de marque enregistrée")).toHaveCount(0);

  await page.getByTestId("brand-preset-prune").click();
  await expect(primary).toHaveValue("#5B2B5E");
  await page.getByLabel("Couleur d'accent", { exact: true }).fill("#f2c14e");
  await page.getByTestId("brand-font-spectral").click();
  await page.getByRole("checkbox", { name: "Afficher mon logo sur mes documents" }).uncheck();
  await page.getByRole("radio", { name: "Centré" }).check();
  await page.getByTestId("banner-input").setInputFiles({ name: "banniere.png", mimeType: "image/png", buffer: png(1600, 400, [91, 43, 94]) });
  await page.getByLabel("Pied de page des documents (facultatif)").fill("Merci pour ta confiance !");
  await expect(page.getByTestId("brand-preview")).toHaveCSS("font-family", /Spectral/);
  await save.click();
  await expect(page.getByText("Image de marque enregistrée")).toBeVisible();
  // Bannière tout juste envoyée : on peut la retirer sans recharger la page.
  await expect(page.getByRole("checkbox", { name: "Retirer la bannière" })).toBeVisible();
  // Aperçu : montants au format de la langue, accent pâle bordé de la couleur principale.
  await expect(page.getByTestId("brand-preview")).toContainText("200\u202f000 Ar");

  const [saved] = (await (
    await adminRest(`workspaces?select=brand_font,brand_primary_color,brand_accent_color,brand_show_logo,brand_logo_position,brand_banner_path,invoice_footer&id=eq.${ws}`)
  ).json()) as Record<string, unknown>[];
  expect(saved).toMatchObject({
    brand_font: "spectral",
    brand_primary_color: "#5B2B5E",
    brand_accent_color: "#F2C14E",
    brand_show_logo: false,
    brand_logo_position: "center",
    invoice_footer: "Merci pour ta confiance !",
  });
  expect(saved.brand_banner_path).toMatch(new RegExp(`^${ws}/banner-.+\\.png$`));

  // PDF d'exemple de Réglages : la marque enregistrée.
  const sample = await page.request.get("/fr/reglages/image-de-marque/apercu");
  expect(sample.headers()["content-type"]).toBe("application/pdf");
  expect((await sample.body()).toString("latin1")).toContain("Spectral-Bold");

  // Devis envoyé depuis l'application.
  const contact = await insert<{ id: string }>("contacts", { workspace_id: ws, name: "Rakoto Jean", phone: "+261341234567" });
  const quote = await insert<{ id: string }>("quotes", { workspace_id: ws, contact_id: contact.id, currency: "MGA" });
  await insert("document_lines", { workspace_id: ws, quote_id: quote.id, description: "Identité visuelle", unit_price: 450000 });
  await page.goto(`/fr/devis/${quote.id}`);
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByText("C'est envoyé ! Partage maintenant le lien avec ton client.")).toBeVisible();
  const publicUrl = await page.getByTestId("public-link").filter({ visible: true }).inputValue();

  // Le client ouvre la page sans compte : bannière, pas de logo, couleurs et police.
  const client = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "fr-FR" });
  const clientPage = await client.newPage();
  await clientPage.goto(publicUrl);
  await expect(clientPage.getByTestId("public-banner")).toBeVisible();
  await expect(clientPage.getByTestId("public-logo")).toHaveCount(0);
  await expect(clientPage.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(91, 43, 94)");
  await expect(clientPage.getByRole("heading", { level: 1 })).toHaveCSS("font-family", /Spectral/);
  await expect(clientPage.locator("summary").filter({ hasText: "J'accepte" })).toHaveCSS(
    "background-color",
    "rgb(242, 193, 78)",
  );
  // Accent pâle (< 3:1 sur fond clair) : bouton du client bordé de la couleur principale.
  await expect(clientPage.locator("summary").filter({ hasText: "J'accepte" })).toHaveCSS("box-shadow", /rgb\(91, 43, 94\)/);
  // Badge de statut à la marque (couleur principale sur sa teinte pâle), pas en turquoise.
  await expect(clientPage.getByTestId("public-status")).toHaveCSS("background-color", "rgb(235, 230, 236)");
  await expect(clientPage.getByTestId("public-status")).toHaveCSS("color", "rgb(91, 43, 94)");
  // Survol du bouton : accent assombri (#D5AA45), texte noir toujours lisible.
  await clientPage.locator("summary").filter({ hasText: "J'accepte" }).hover();
  await expect(clientPage.locator("summary").filter({ hasText: "J'accepte" })).toHaveCSS("background-color", "rgb(213, 170, 69)");
  await clientPage.screenshot({ path: test.info().outputPath("page-client-marque.png"), fullPage: true });
  const { violations } = await new AxeBuilder({ page: clientPage }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${v.id} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  const download = await clientPage.request.get(`${publicUrl}/pdf?telecharger`);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  const pdf = await download.body();
  writeFileSync(test.info().outputPath("devis-marque.pdf"), pdf);
  const raw = pdf.toString("latin1");
  expect(raw).toContain("Spectral-Bold");
  expect(raw).not.toContain("LiberationSans");
  // Une seule image : la bannière (logo masqué).
  expect(raw.match(/\/Subtype \/Image/g)).toHaveLength(1);

  // Marque changée ensuite : le devis envoyé garde celle de son envoi.
  await page.goto("/fr/reglages/image-de-marque");
  await page.getByTestId("brand-font-montserrat").click();
  await page.getByRole("button", { name: "Enregistrer l'image de marque" }).click();
  await expect(page.getByText("Image de marque enregistrée")).toBeVisible();
  const again = (await (await clientPage.request.get(`${publicUrl}/pdf`)).body()).toString("latin1");
  expect(again).toContain("Spectral-Bold");
  expect(again).not.toContain("Montserrat");
  await client.close();
});
