import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
const requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
const { allowAuthAttempt, clientIp } = await import("./rate-limit");

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

describe("allowAuthAttempt", () => {
  beforeEach(() => {
    rpc.mockReset();
    requestHeaders.set("x-forwarded-for", "41.188.1.2");
  });

  it("compte par IP puis par e-mail", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await allowAuthAttempt("verify", "a@example.test")).toBe(true);
    expect(rpc.mock.calls.map(([, args]) => [args.p_key, args.p_max])).toEqual([
      ["verify:ip:41.188.1.2", 50],
      ["verify:email:a@example.test", 10],
    ]);
  });

  it("IP au-delà de la limite : refus, l'e-mail n'est pas compté", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await allowAuthAttempt("send", "a@example.test")).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("e-mail au-delà de la limite : refus", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await allowAuthAttempt("send", "a@example.test")).toBe(false);
  });

  it("base injoignable : connexion permise (limites Supabase restantes)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await allowAuthAttempt("send", "a@example.test")).toBe(true);
  });
});
