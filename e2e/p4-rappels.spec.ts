import { expect, test } from "@playwright/test";
import { cronSecret, openMore, pageBeforeJavaScript, signUpAndOnboard } from "./helpers";

// Date du jour à Antananarivo (AAAA-MM-JJ), quel que soit le fuseau de la machine de test.
function todayInAntananarivo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo" }).format(new Date());
}

// « ven. 23 oct. » : jour J+offset à Antananarivo, comme l'affiche la liste des rappels.
function dayInAntananarivo(offset: number): string {
  const date = new Date(Date.now() + offset * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Antananarivo", weekday: "short", day: "numeric", month: "short" }).format(date);
}

test("P4 : rappel → Aujourd'hui sur l'accueil → fait", async ({ page }) => {
  await signUpAndOnboard(page, "p4");
  const today = page.getByTestId("today").filter({ visible: true });
  await expect(today).toContainText("Rien à faire aujourd'hui.");

  // Un contact joignable par e-mail seulement.
  await openMore(page, "Plus");
  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await page.getByRole("link", { name: "Nouveau contact" }).click();
  await page.getByLabel("Nom", { exact: true }).fill("Soa");
  await page.getByLabel("E-mail").fill("soa@example.mg");
  await page.getByRole("button", { name: "Ajouter le contact" }).click();
  await expect(page.getByRole("heading", { name: "Soa" })).toBeVisible();

  // « Me rappeler » en un geste : demain, 9 h (heure de Madagascar), objet par défaut.
  await page.getByRole("button", { name: "Demain" }).click();
  await expect(page.getByText("Rappel programmé.")).toBeVisible();
  const reminders = page.getByTestId("reminder").filter({ visible: true });
  await expect(reminders.filter({ hasText: "Relancer Soa" })).toContainText("Demain à 09:00");

  // Date précise : aujourd'hui à 00:01 (déjà passé, donc en retard).
  await page.getByLabel("Objet (facultatif)").fill("Envoyer le devis");
  await page.getByText("Autre date").click();
  await page.getByLabel("Date et heure du rappel").fill(`${todayInAntananarivo()}T00:01`);
  await page.getByRole("button", { name: "Programmer" }).click();
  await expect(reminders.filter({ hasText: "Envoyer le devis" })).toContainText("Aujourd'hui à 00:01");
  await expect(reminders.filter({ hasText: "Envoyer le devis" })).toContainText("En retard");

  // Accueil : seul le rappel du jour apparaît dans « Aujourd'hui ».
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await nav.getByRole("link", { name: "Accueil" }).click();
  await expect(today).toContainText("1 rappel");
  await expect(today.getByTestId("reminder")).toHaveCount(1);
  await expect(today.getByTestId("reminder")).toContainText("Envoyer le devis");
  await expect(today.getByRole("link", { name: "Soa" })).toBeVisible();

  // Contact archivé : ses rappels quittent « Aujourd'hui » ; « Annuler » les ramène.
  await today.getByRole("link", { name: "Soa" }).click();
  await page.getByRole("button", { name: "Archiver ce contact" }).click();
  await expect(page.getByText("Soa est archivé.")).toBeVisible();
  await nav.getByRole("link", { name: "Accueil" }).click();
  await expect(today).toContainText("Rien à faire aujourd'hui.");
  await page.goBack();
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("heading", { name: "Soa" })).toBeVisible();
  await nav.getByRole("link", { name: "Accueil" }).click();
  await expect(today).toContainText("1 rappel");

  // Fait, en un geste, même avant le chargement du JavaScript : la liste du jour se vide.
  const { plain, context } = await pageBeforeJavaScript(page);
  await plain.goto("/fr/tableau-de-bord");
  const plainToday = plain.getByTestId("today").filter({ visible: true });
  await plainToday.getByRole("button", { name: "Marquer « Envoyer le devis » comme fait" }).click();
  await expect(plainToday).toContainText("Rien à faire aujourd'hui.");
  await context.close();
  await page.reload();
  await expect(today).toContainText("Rien à faire aujourd'hui.");

  // Repousser le rappel de demain d'une semaine, depuis la fiche.
  await page.goto("/fr/contacts");
  await page.getByRole("link", { name: /Soa/ }).click();
  const tomorrow = page.getByTestId("reminder").filter({ visible: true }).filter({ hasText: "Relancer Soa" });
  await tomorrow.getByRole("group", { name: "Repousser « Relancer Soa »" }).getByRole("button", { name: "+1 semaine" }).click();
  // Repousser recule à partir de la date prévue : demain + 7 jours, toujours à 9 h.
  await expect(tomorrow).toContainText(`${dayInAntananarivo(8)} à 09:00`);
  await expect(page.getByTestId("reminder").filter({ visible: true })).toHaveCount(1);
});

test("Notification des rappels : route du cron protégée", async ({ request }) => {
  const anonymous = await request.get("/api/cron/reminders");
  expect(anonymous.status()).toBe(401);
  const wrong = await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer mauvais" } });
  expect(wrong.status()).toBe(401);

  const run = await request.get("/api/cron/reminders", { headers: { Authorization: `Bearer ${cronSecret()}` } });
  expect(run.status()).toBe(200);
  expect(await run.json()).toMatchObject({ claimed: expect.any(Number), sent: expect.any(Number) });
});
