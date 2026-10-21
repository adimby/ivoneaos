import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { adminRest, signUpAndOnboard } from "./helpers";
import { readEmail } from "./mailpit";
import { connectPapi, mockLinks, signedNotification } from "./papi";

// P5 d'un seul tenant, sans raccourci entre les étapes : devis envoyé par e-mail → accepté
// par le client → facture → lien Papi → PDF → paiement notifié → facture payée → tableau
// de bord. Chaque étape est détaillée dans p5-devis-facture et p5-paiement-papi ; ici, on
// prouve qu'elles s'enchaînent.
const money = (text: string) => new RegExp(text.replace(/ /g, "\\s"));
const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo", year: "numeric" }).format(new Date());

async function insert<T>(table: string, row: object): Promise<T> {
  const response = await adminRest(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  expect(response.ok, `${table} : ${await response.clone().text()}`).toBe(true);
  return ((await response.json()) as T[])[0];
}

async function pdfText(body: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(body), useSystemFonts: false });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    for (const item of content.items) if ("str" in item) parts.push(item.str);
  }
  await task.destroy();
  return parts.join("");
}

test("P5 complet : devis par e-mail → accepté → facture → Papi → payée → tableau de bord", async ({ page, browser }) => {
  const { email, business } = await signUpAndOnboard(page, "p5full");
  const { secret } = await connectPapi(page);
  const ws = await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`);
  const [{ id: workspaceId }] = (await ws.json()) as { id: string }[];
  const clientEmail = `client-${randomUUID()}@example.test`;
  const contact = await insert<{ id: string }>("contacts", { workspace_id: workspaceId, name: "Rabe Tiana", email: clientEmail });
  const [stage] = (await (await adminRest(`pipeline_stages?select=id&workspace_id=eq.${workspaceId}&name=eq.quote`)).json()) as {
    id: string;
  }[];
  const deal = await insert<{ id: string }>("deals", {
    workspace_id: workspaceId,
    contact_id: contact.id,
    stage_id: stage.id,
    title: "Site vitrine",
    amount: 450000,
  });

  // Devis depuis l'opportunité, envoyé, puis partagé par e-mail.
  await page.goto(`/fr/pipeline/${deal.id}`);
  await page.getByRole("link", { name: "Créer un devis" }).click();
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeEnabled();
  const line = page.getByTestId("line").first();
  await line.getByLabel("Description").fill("Site vitrine 5 pages");
  await line.getByLabel("Prix unitaire (Ar)").fill("450 000");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await page.getByRole("button", { name: "Envoyer le devis" }).click();
  await expect(page.getByRole("heading", { name: `Devis D-${year}-0001` })).toBeVisible();
  const since = new Date(Date.now() - 2_000);
  await page.getByRole("button", { name: "Envoyer par e-mail" }).click();
  await expect(page.getByText("E-mail envoyé à ton client.")).toBeVisible();
  const mail = await readEmail(clientEmail, since);
  expect(mail.Subject).toBe(`Devis D-${year}-0001 de ${business}`);
  expect(mail.From.Name).toBe(`${business} via Ivonea OS`);
  // Le client répond à la freelance, pas à Ivonea.
  expect(mail.ReplyTo?.map((r) => r.Address)).toEqual([email]);
  const quoteLink = mail.Text.match(/https?:\/\/\S+\/fr\/p\/[A-Za-z0-9_-]{32}/)?.[0];
  expect(quoteLink, "lien public dans l'e-mail").toBeTruthy();

  // Le client ouvre le lien de l'e-mail, sans compte, et accepte.
  const client = await browser.newContext({ viewport: { width: 360, height: 780 }, locale: "fr-FR", isMobile: true, hasTouch: true });
  const pub = await client.newPage();
  await pub.goto(quoteLink!);
  await expect(pub.getByTestId("public-total")).toHaveText(money("450 000 Ar"));
  await pub.getByTestId("accept").locator("summary").click();
  await pub.getByRole("button", { name: "Je confirme mon accord" }).click();
  await expect(pub.getByTestId("public-status")).toHaveText("Accepté");

  // Facture depuis le devis accepté, envoyée : lien Papi créé avec la clé de la freelance.
  await page.reload();
  await page.getByRole("button", { name: "Transformer en facture" }).click();
  await expect(page).toHaveURL(/\/fr\/factures\/[0-9a-f-]{36}\?ok=converted$/);
  const invoiceId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByRole("button", { name: "Envoyer la facture" }).click();
  const number = `F-${year}-0001`;
  await expect(page.getByRole("heading", { name: `Facture ${number}` })).toBeVisible();
  const invoiceLink = await page.getByTestId("public-link").filter({ visible: true }).inputValue();
  const reference = `IVN-${invoiceId}-1`;
  const link = (await mockLinks()).find((l) => l.paymentReference === reference);
  expect(link, "lien créé chez Papi").toBeTruthy();
  expect(link!.amount).toBe(450000);

  // PDF de la facture : numéro, total, et lien vers la page publique (où l'on paie).
  const pdf = await pub.request.get(`${invoiceLink}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const text = await pdfText(await pdf.body());
  expect(text).toContain(number);
  expect(text).toMatch(money("450 000 Ar"));
  expect(text.replace(/\s/g, "")).toContain(invoiceLink);

  // Le client paie depuis la page publique de la facture.
  await pub.goto(invoiceLink);
  await expect(pub.getByTestId("pay-online")).toHaveText(money("Payer 450 000 Ar avec Papi"));
  const go = await pub.request.get(`${invoiceLink}/payer`, { maxRedirects: 0 });
  expect(go.headers().location).toBe(link!.paymentLink);

  // Papi notifie Ivonea OS (signature du secret de la freelance) : facture payée.
  const notification = signedNotification(
    {
      paymentStatus: "SUCCESS",
      paymentMethod: "ORANGE_MONEY",
      currency: "MGA",
      amount: 450000,
      fee: 4500,
      clientName: "Rabe Tiana",
      description: `Facture ${number}`,
      merchantPaymentReference: reference,
      paymentReference: randomUUID(),
      notificationToken: link!.notificationToken,
      message: "Paiement effectué avec succès.",
    },
    secret,
  );
  const notified = await page.request.post("/api/papi/notification", { headers: notification.headers, data: notification.raw });
  expect(await notified.json()).toEqual({ received: true, result: "recorded" });

  await pub.reload();
  await expect(pub.getByTestId("public-status")).toHaveText("Payée");
  await client.close();

  // Freelance : facture payée, tableau de bord à jour, opportunité gagnée.
  await page.goto(`/fr/factures/${invoiceId}`);
  await expect(page.getByTestId("paid-notice").filter({ visible: true })).toHaveText(money(`Facture ${number} payée : 450 000 Ar`));
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Accueil" }).click();
  await expect(page.getByTestId("dash-collected-amount").filter({ visible: true })).toHaveText(money("450 000 Ar"));
  await expect(page.getByTestId("recently-paid").filter({ visible: true })).toContainText(money(`Facture ${number} payée : 450 000 Ar`));
  await expect(page.getByTestId("checklist-quote").filter({ visible: true })).toHaveAttribute("data-done", "true");
  await page.goto(`/fr/pipeline/${deal.id}`);
  await expect(page.getByTestId("deal-stage").filter({ visible: true })).toHaveText("Étape : Gagné");
});
