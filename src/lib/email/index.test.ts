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
