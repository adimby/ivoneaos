import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fromHeader } = await import("./index");

describe("fromHeader", () => {
  it("garde l'expéditeur par défaut sans nom", () => {
    expect(fromHeader("Ivonea OS <notifications@ivonea.com>")).toBe("Ivonea OS <notifications@ivonea.com>");
  });

  it("met le nom de la freelance devant « via Ivonea OS », même adresse", () => {
    expect(fromHeader("Ivonea OS <notifications@ivonea.com>", "Studio Hery")).toBe(
      '"Studio Hery via Ivonea OS" <notifications@ivonea.com>',
    );
    expect(fromHeader("notifications@ivonea.com", "Hery")).toBe('"Hery via Ivonea OS" <notifications@ivonea.com>');
  });

  it("échappe guillemets et barres obliques, retire les retours à la ligne", () => {
    expect(fromHeader("<n@ivonea.com>", 'Le "Studio"\\\r\nBcc: x')).toBe(
      '"Le \\"Studio\\"\\\\ Bcc: x via Ivonea OS" <n@ivonea.com>',
    );
  });
});

describe("sendEmail", () => {
  const email = { to: "client@example.test", subject: "Devis", text: "Bonjour", html: "<p>Bonjour</p>" };

  it("sans clé : rien n'est envoyé", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./index");
    expect(await sendEmail(email)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("envoie à l'API Resend, ou à RESEND_API_BASE_URL (tests de bout en bout)", async () => {
    const { sendEmail } = await import("./index");
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_API_BASE_URL", "");
    expect(await sendEmail(email)).toBe("sent");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    vi.stubEnv("RESEND_API_BASE_URL", "http://127.0.0.1:3197/");
    await sendEmail(email);
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:3197/emails");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
