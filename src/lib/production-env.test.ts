import { describe, expect, it } from "vitest";
import { appUrlOrigin, missingAppUrlWarning, productionEnvErrors } from "./production-env";

const valid = {
  IVONEA_CONTACT_EMAIL: "bonjour@ivonea.com",
  APP_URL: "https://app.ivonea.com/",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  PAYMENT_SECRETS_KEY: "cle",
  CRON_SECRET: "secret",
  RESEND_API_KEY: "re_x",
};

describe("appUrlOrigin", () => {
  it("origine seule, sans chemin", () => {
    expect(appUrlOrigin(" https://app.ivonea.com/fr ")).toBe("https://app.ivonea.com");
  });
  it("absente ou invalide", () => {
    expect(appUrlOrigin(undefined)).toBeNull();
    expect(appUrlOrigin("app.ivonea.com")).toBeNull();
    expect(appUrlOrigin("javascript:alert(1)")).toBeNull();
  });
});

describe("productionEnvErrors", () => {
  it("réglages complets : aucune erreur", () => {
    expect(productionEnvErrors(valid)).toEqual([]);
  });
  it("APP_URL absente, invalide ou sans https", () => {
    for (const APP_URL of [undefined, "", "pas une url", "http://app.ivonea.com"]) {
      expect(productionEnvErrors({ ...valid, APP_URL }).join()).toMatch(/APP_URL/);
    }
  });
  it("adresse de contact absente", () => {
    expect(productionEnvErrors({ ...valid, IVONEA_CONTACT_EMAIL: undefined }).join()).toMatch(/IVONEA_CONTACT_EMAIL/);
  });
  it("secrets serveur absents ou vides", () => {
    for (const name of ["SUPABASE_SECRET_KEY", "PAYMENT_SECRETS_KEY", "CRON_SECRET", "RESEND_API_KEY"]) {
      expect(productionEnvErrors({ ...valid, [name]: undefined }).join()).toMatch(name);
      expect(productionEnvErrors({ ...valid, [name]: " " })).toHaveLength(1);
    }
  });
  it("URL de services simulés refusées", () => {
    const errors = productionEnvErrors({
      ...valid,
      RESEND_API_BASE_URL: "https://evil.example",
      PAPI_API_BASE_URL: "http://127.0.0.1:3199",
      WHOP_API_BASE_URL: "http://127.0.0.1:3198",
    });
    expect(errors).toHaveLength(3);
  });
});

describe("missingAppUrlWarning", () => {
  it("production hors de Vercel sans APP_URL : avertissement", () => {
    expect(missingAppUrlWarning({ NODE_ENV: "production" })).toMatch(/APP_URL/);
    expect(missingAppUrlWarning({ NODE_ENV: "production", APP_URL: "pas une url" })).toMatch(/APP_URL/);
  });
  it("APP_URL renseignée, Vercel ou développement : rien", () => {
    expect(missingAppUrlWarning({ NODE_ENV: "production", APP_URL: "https://app.ivonea.com" })).toBeNull();
    expect(missingAppUrlWarning({ NODE_ENV: "production", VERCEL: "1" })).toBeNull();
    expect(missingAppUrlWarning({ NODE_ENV: "development" })).toBeNull();
  });
});
