import { describe, expect, it } from "vitest";
import { levelFromClients } from "./level";

describe("levelFromClients", () => {
  it("0 client : Lancer", () => {
    expect(levelFromClients(0)).toBe("lancer");
  });
  it("au moins un client : Remplir son agenda", () => {
    expect(levelFromClients(1)).toBe("remplir");
    expect(levelFromClients(25)).toBe("remplir");
  });
});
