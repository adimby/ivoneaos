import { defineConfig, devices } from "@playwright/test";

// Parcours E2E (docs/spec-mvp.md). Prérequis : Supabase local démarré (npx supabase start),
// .env.local renseigné. Les codes de connexion sont lus dans Mailpit.
// Port dédié (pas 3000, souvent pris par `npm run dev`) ; jamais de serveur réutilisé :
// la suite construit et lance toujours la version testée, et échoue clairement si le
// port est déjà occupé (E2E_PORT pour en choisir un autre).
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Téléphone d'entrée de gamme : 360 × 780, tactile.
    ...devices["Desktop Chrome"],
    viewport: { width: 360, height: 780 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium-mobile" }],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}/fr`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
