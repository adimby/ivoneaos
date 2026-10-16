import { defineConfig, devices } from "@playwright/test";

// Parcours E2E (docs/spec-mvp.md). Prérequis : Supabase local démarré (npx supabase start),
// .env.local renseigné. Les codes de connexion sont lus dans Mailpit.
// Port dédié (pas 3000, souvent pris par `npm run dev`) ; jamais de serveur réutilisé :
// la suite construit et lance toujours la version testée, et échoue clairement si le
// port est déjà occupé (E2E_PORT pour en choisir un autre).
const port = Number(process.env.E2E_PORT ?? 3100);
// Papi simulé (e2e/papi-mock.mjs) : l'application le joint via PAPI_API_BASE_URL.
const papiPort = Number(process.env.PAPI_MOCK_PORT ?? 3199);
// Whop simulé (e2e/whop-mock.mjs) et seconde instance de l'application avec Whop activé
// (même construction .next, lancée seulement) : l'instance principale reste sans Whop.
const whopPort = Number(process.env.WHOP_MOCK_PORT ?? 3198);
const whopAppPort = Number(process.env.E2E_WHOP_PORT ?? 3101);
// Resend simulé (e2e/resend-mock.mjs) : les e-mails de l'instance principale arrivent dans
// Mailpit, comme les codes de connexion.
const resendPort = Number(process.env.RESEND_MOCK_PORT ?? 3197);

// IP client propre à chaque lancement de la suite (x-forwarded-for, lue par les limites de
// connexion hors Vercel) : plusieurs suites à la suite, ou en parallèle sur la même base,
// ne partagent pas le compteur par IP de 127.0.0.1. Fixée une fois par le processus
// principal, héritée par les processus de test.
const clientIp = (process.env.E2E_CLIENT_IP ??= `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 254) + 1).join(".")}`);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // CI : annotations GitHub et rapport HTML (artefact en cas d'échec).
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Téléphone d'entrée de gamme : 360 × 780, tactile.
    ...devices["Desktop Chrome"],
    viewport: { width: 360, height: 780 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    trace: "retain-on-failure",
    extraHTTPHeaders: { "x-forwarded-for": clientIp },
  },
  projects: [{ name: "chromium-mobile" }],
  webServer: [
    {
      command: "node e2e/papi-mock.mjs",
      url: `http://127.0.0.1:${papiPort}/__mock/health`,
      env: { PAPI_MOCK_PORT: String(papiPort) },
      reuseExistingServer: false,
    },
    {
      command: "node e2e/resend-mock.mjs",
      url: `http://127.0.0.1:${resendPort}/__mock/health`,
      env: { RESEND_MOCK_PORT: String(resendPort) },
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npm run start -- --port ${port}`,
      url: `http://127.0.0.1:${port}/fr`,
      env: {
        PAPI_API_BASE_URL: `http://127.0.0.1:${papiPort}`,
        RESEND_API_BASE_URL: `http://127.0.0.1:${resendPort}`,
        RESEND_API_KEY: "re_e2e_test",
      },
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: "node e2e/whop-mock.mjs",
      url: `http://127.0.0.1:${whopPort}/__mock/health`,
      env: { WHOP_MOCK_PORT: String(whopPort) },
      reuseExistingServer: false,
    },
    {
      // Lancée après la construction faite par le serveur précédent (démarrage séquentiel).
      command: `npm run start -- --port ${whopAppPort}`,
      url: `http://127.0.0.1:${whopAppPort}/fr`,
      env: {
        PAPI_API_BASE_URL: `http://127.0.0.1:${papiPort}`,
        WHOP_API_BASE_URL: `http://127.0.0.1:${whopPort}/api/v1`,
        WHOP_API_KEY: "whop-test-platform",
        WHOP_WEBHOOK_SECRET: "ws_e2e_whop_webhook_secret",
        WHOP_PLATFORM_FEE_PERCENT: "5",
        IVONEA_CONTACT_EMAIL: "bonjour@example.test",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
