import { afterEach, describe, expect, it, vi } from "vitest";
import { whopEnabled } from "./service";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe("whopEnabled", () => {
  const configured = () => {
    vi.stubEnv("WHOP_API_KEY", "whop-key");
    vi.stubEnv("WHOP_WEBHOOK_SECRET", "ws_secret");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  };

  it("clé de la plateforme, secret du webhook et client serveur : Whop proposé", () => {
    configured();
    expect(whopEnabled()).toBe(true);
  });

  it("sans secret du webhook (paiement jamais enregistré) ou sans clé : Whop masqué", () => {
    configured();
    vi.stubEnv("WHOP_WEBHOOK_SECRET", " ");
    expect(whopEnabled()).toBe(false);
    configured();
    vi.stubEnv("WHOP_API_KEY", "");
    expect(whopEnabled()).toBe(false);
    configured();
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(whopEnabled()).toBe(false);
  });
});
