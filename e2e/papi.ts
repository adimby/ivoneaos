import { createHmac, randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// Papi simulé (e2e/papi-mock.mjs) : clés « papi-test-… » acceptées.
export const PAPI_MOCK_URL = `http://127.0.0.1:${process.env.PAPI_MOCK_PORT ?? 3199}`;

// prefix « down- » ou « revoked- » : création de lien en échec (voir papi-mock.mjs).
export function papiCredentials(prefix = "") {
  return { apiKey: `papi-test-${prefix}${randomBytes(12).toString("hex")}`, secret: `pwhsec_${randomBytes(32).toString("hex")}` };
}

// Parcours P2 abrégé : Réglages > Moyens de paiement, clé et secret collés.
export async function connectPapi(page: Page, credentials = papiCredentials()) {
  await page.goto("/fr/reglages/paiements");
  await page.getByLabel("Clé API Papi").fill(credentials.apiKey);
  await page.getByLabel("Secret de signature").fill(credentials.secret);
  await page.getByRole("button", { name: "Vérifier et connecter Papi" }).click();
  await expect(page.getByTestId("papi-status")).toHaveText("Papi connecté");
  return credentials;
}

type MockLink = {
  paymentReference: string;
  amount: number;
  paymentLink: string;
  notificationToken: string;
  notificationUrl: string;
  successUrl: string;
};

export async function mockLinks(): Promise<MockLink[]> {
  const response = await fetch(`${PAPI_MOCK_URL}/__mock/links`);
  return ((await response.json()) as { links: MockLink[] }).links;
}

// Notification telle que Papi l'envoie : corps JSON, en-tête X-Papi-Signature
// « t=<secondes>,v1=HMAC-SHA256(secret, t + "." + corps) ».
export function signedNotification(body: object, secret: string, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { raw, headers: { "Content-Type": "application/json", "User-Agent": "PAPI-Callback/1.0", "X-Papi-Signature": `t=${t},v1=${v1}` } };
}
