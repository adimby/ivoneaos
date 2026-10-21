import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
const requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
const { takeAuthAttempt, clientIp } = await import("./rate-limit");
const { attemptKey } = await import("./attempt-key");

describe("clientIp", () => {
  it("Vercel : x-real-ip, posée par la plateforme", () => {
    const h = new Headers({ "x-real-ip": "41.188.1.2", "x-forwarded-for": "1.1.1.1" });
    expect(clientIp(h, true)).toBe("41.188.1.2");
  });
  it("hors Vercel : première adresse de x-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "41.188.1.2, 10.0.0.1" });
    expect(clientIp(h, false)).toBe("41.188.1.2");
  });
  it("aucune adresse", () => {
    expect(clientIp(new Headers(), false)).toBe("unknown");
  });
});

describe("takeAuthAttempt", () => {
  const secret = "sb_secret_test";
  const key = (action: string, scope: "ip" | "email_ip" | "email", value: string) => attemptKey(secret, action, scope, value);

  beforeEach(() => {
    rpc.mockReset();
    vi.stubEnv("SUPABASE_SECRET_KEY", secret);
    requestHeaders.set("x-forwarded-for", "41.188.1.2");
  });

  it("compte par IP, par e-mail et IP, puis par e-mail, sans donnée en clair", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect((await takeAuthAttempt("verify", "a@example.test")).allowed).toBe(true);
    const calls = rpc.mock.calls.map(([, args]) => [args.p_key, args.p_max]);
    expect(calls).toEqual([
      [key("verify", "ip", "41.188.1.2"), 20],
      [key("verify", "email_ip", "a@example.test|41.188.1.2"), 5],
      [key("verify", "email", "a@example.test"), 10],
    ]);
    for (const [k] of calls) expect(k).toMatch(/^[0-9a-f]{64}$/);
  });

  it("IP au-delà de la limite : refus, l'e-mail n'est pas compté", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await takeAuthAttempt("send", "a@example.test")).allowed).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("une IP ne pèse que email_ip sur le compteur par e-mail", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect((await takeAuthAttempt("send", "a@example.test")).allowed).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("e-mail au-delà de la limite : refus", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    expect((await takeAuthAttempt("send", "a@example.test")).allowed).toBe(false);
  });

  it("release rend les essais comptés pour l'e-mail, jamais celui de l'IP", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const attempt = await takeAuthAttempt("send", "a@example.test");
    rpc.mockClear();
    await attempt.release();
    expect(rpc.mock.calls).toEqual([
      ["auth_rate_limit_release", { p_key: key("send", "email_ip", "a@example.test|41.188.1.2") }],
      ["auth_rate_limit_release", { p_key: key("send", "email", "a@example.test") }],
    ]);
  });

  it("base injoignable : connexion permise (limites Supabase restantes)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await takeAuthAttempt("send", "a@example.test")).allowed).toBe(true);
  });
});
