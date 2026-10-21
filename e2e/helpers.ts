import { expect, type BrowserContext, type Page } from "@playwright/test";
import { attemptKey, type AttemptScope } from "../src/modules/auth/attempt-key";
import { readOtp } from "./mailpit";

// Note : Next garde les pages déjà visitées dans le DOM, masquées (retour instantané) ;
// les sélecteurs par data-testid filtrent donc sur ce qui est visible.

export async function signIn(page: Page, email: string) {
  // IP client neuve à chaque connexion (x-forwarded-for, lue hors Vercel) : la suite se
  // connecte plus souvent que la limite par IP (src/modules/auth/rate-limit.ts).
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 254) + 1).join(".")}` });
  await page.getByLabel("Adresse e-mail").fill(email);
  const since = new Date(Date.now() - 2_000);
  const send = page.getByRole("button", { name: "Recevoir mon code" });
  const codeTitle = page.getByRole("heading", { name: "Saisis ton code" });
  // Supabase refuse deux envois au même e-mail à moins d'une seconde (max_frequency) :
  // nouvel essai tant que l'écran du code n'est pas affiché. Le bouton est désactivé
  // pendant l'envoi, un clic n'en relance donc jamais un second en parallèle.
  await expect(async () => {
    if (!(await codeTitle.isVisible())) await send.click({ timeout: 2_000 });
    await expect(codeTitle).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000], timeout: 30_000 });
  const code = await readOtp(email, since);
  await page.getByLabel("Code reçu par e-mail").fill(code);
  await page.getByRole("button", { name: "Me connecter" }).click();
}

// Ouvre le menu « Plus » : bouton (menu sur place) une fois le JavaScript chargé, lien
// vers la page /plus sinon ; les deux montrent les mêmes entrées.
export async function openMore(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: /Navigation principale|Main navigation/ });
  await nav.getByRole("button", { name }).or(nav.getByRole("link", { name })).click();
}

// Nouveau compte au profil complet (parcours P1 abrégé), arrivé sur le tableau de bord.
// Le nom commercial est unique : il retrouve le workspace (adminRest).
export async function signUpAndOnboard(page: Page, prefix: string): Promise<{ email: string; business: string }> {
  const stamp = Date.now();
  const email = `${prefix}-${stamp}@example.test`;
  const business = `Studio ${prefix} ${stamp}`;
  await page.goto("/fr/connexion");
  await signIn(page, email);
  await expect(page).toHaveURL(/\/fr\/demarrage$/);
  await page.getByLabel("Ton métier").fill("Graphiste");
  await page.getByLabel("Depuis combien de temps es-tu freelance ?").selectOption("1to3");
  await page.getByLabel("Combien de clients as-tu en ce moment ?").fill("2");
  await page.getByLabel("Ton objectif de revenu mensuel").fill("2 000 000");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Nom commercial").fill(business);
  await page.getByLabel("Adresse", { exact: true }).fill("Lot II A 12, Antananarivo");
  await page.getByLabel("NIF").fill("3000123456");
  await page.getByLabel("STAT").fill("74111 11 2020 0 01234");
  await page.getByLabel("Régime fiscal").selectOption("impot_synthetique");
  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page).toHaveURL(/\/fr\/tableau-de-bord$/);
  return { email, business };
}

// Variables de .env.local (clé secrète Supabase, CRON_SECRET) pour préparer les données.
function env(name: string): string {
  if (!process.env[name]) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // Variables déjà fournies par l'environnement (CI).
    }
  }
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquante (.env.local)`);
  return value;
}

// Clé d'un compteur de public.auth_attempts, calculée comme l'application.
export function authAttemptKey(action: "send" | "verify", scope: AttemptScope, value: string): string {
  return attemptKey(env("SUPABASE_SECRET_KEY"), action, scope, value);
}

export function cronSecret(): string {
  return env("CRON_SECRET");
}

// Appel REST Supabase avec la clé secrète (RLS contournée) : préparation des tests seulement.
export async function adminRest(path: string, init: RequestInit = {}): Promise<Response> {
  const key = env("SUPABASE_SECRET_KEY");
  return fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, "Content-Type": "application/json", ...init.headers },
  });
}

// Même session, avant le chargement du JavaScript (connexion lente) : fichiers JS de
// l'application bloqués, seuls les petits scripts intégrés à la page tournent. Fermer le
// contexte renvoyé après usage.
export async function pageBeforeJavaScript(page: Page): Promise<{ plain: Page; context: BrowserContext }> {
  const context = await page.context().browser()!.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 360, height: 780 },
    locale: "fr-FR",
    baseURL: new URL(page.url()).origin,
  });
  await context.route("**/_next/static/**/*.js", (route) => route.abort());
  return { plain: await context.newPage(), context };
}
