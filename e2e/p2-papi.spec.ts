import { expect, test } from "@playwright/test";
import { adminRest, signUpAndOnboard } from "./helpers";
import { papiCredentials } from "./papi";

test("P2 : connecter son compte Papi depuis la liste de démarrage", async ({ page }) => {
  const { business } = await signUpAndOnboard(page, "p2");

  // 1. Depuis la liste de démarrage : « Moyens de paiement ».
  const item = page.getByTestId("checklist-papi").filter({ visible: true });
  await expect(item).toHaveAttribute("data-done", "false");
  await item.click();
  await expect(page).toHaveURL(/\/fr\/reglages\/paiements$/);
  await expect(page.getByRole("heading", { name: "Moyens de paiement" })).toBeVisible();
  await expect(page.getByTestId("papi-status")).toHaveText("Non connecté");

  // 2. Guide pas à pas : compte, boutique, clé (Boutiques > Développeur), secret.
  await expect(page.getByRole("heading", { name: "Connecter Papi en 5 étapes" })).toBeVisible();
  await expect(page.getByText("ouvre l'onglet « Développeur »", { exact: false })).toBeVisible();
  await expect(page.getByText("vérifie la liste des pièces et le montant des frais", { exact: false })).toBeVisible();
  // Coordonnées manuelles toujours disponibles.
  await expect(page.getByRole("heading", { name: "Coordonnées directes" })).toBeVisible();

  const { apiKey, secret } = papiCredentials();
  const connect = page.getByRole("button", { name: "Vérifier et connecter Papi" });
  await expect(connect).toBeInViewport();

  // 3-4. Clé inconnue de Papi : erreur en clair, rien d'enregistré.
  await page.getByLabel("Clé API Papi").fill("cle-inconnue-0123456789abcdef");
  await page.getByLabel("Secret de signature").fill(secret);
  await connect.click();
  await expect(page.getByRole("alert").filter({ hasText: "Papi ne reconnaît pas cette clé" })).toBeVisible();
  await expect(page.getByTestId("papi-status")).toHaveText("Non connecté");

  // Secret au mauvais format : refusé sans appeler Papi.
  await page.getByLabel("Clé API Papi").fill(apiKey);
  await page.getByLabel("Secret de signature").fill("mon-secret");
  await page.getByRole("button", { name: "Vérifier et connecter Papi" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "commence par « pwhsec_ »" })).toBeVisible();

  // Clé valide (404 sur une référence inexistante) : « Papi connecté ».
  await page.getByLabel("Clé API Papi").fill(apiKey);
  await page.getByLabel("Secret de signature").fill(secret);
  await page.getByRole("button", { name: "Vérifier et connecter Papi" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Papi connecté." })).toBeVisible();
  await expect(page.getByTestId("papi-status")).toHaveText("Papi connecté");

  // Jamais réaffichés en clair ; chiffrés en base.
  const html = await page.content();
  expect(html).not.toContain(apiKey);
  expect(html).not.toContain(secret);
  const ws = await adminRest(`workspaces?select=id&name=eq.${encodeURIComponent(business)}`);
  const [{ id }] = (await ws.json()) as { id: string }[];
  const accounts = await adminRest(
    `payment_accounts?select=status,encrypted_api_key,encrypted_signing_secret&workspace_id=eq.${id}&provider=eq.papi`,
  );
  const [account] = (await accounts.json()) as { status: string; encrypted_api_key: string; encrypted_signing_secret: string }[];
  expect(account.status).toBe("connected");
  expect(account.encrypted_api_key).toMatch(/^v1:/);
  expect(account.encrypted_api_key).not.toContain(apiKey);
  expect(account.encrypted_signing_secret).not.toContain(secret.slice(7));

  // La liste de démarrage est à jour.
  await page.goto("/fr/tableau-de-bord");
  await expect(page.getByTestId("checklist-papi").filter({ visible: true })).toHaveAttribute("data-done", "true");

  // Déconnecter : secrets effacés.
  await page.goto("/fr/reglages/paiements");
  await page.getByText("Déconnecter Papi", { exact: true }).click();
  await page.getByRole("button", { name: "Oui, déconnecter Papi" }).click();
  await expect(page.getByTestId("papi-status")).toHaveText("Non connecté");
  const after = await adminRest(`payment_accounts?select=status,encrypted_api_key&workspace_id=eq.${id}&provider=eq.papi`);
  expect(await after.json()).toEqual([{ status: "disabled", encrypted_api_key: null }]);
});
