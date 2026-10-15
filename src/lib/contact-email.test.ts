import { describe, expect, it } from "vitest";
import { ivoneaContactEmail } from "./contact-email";

describe("ivoneaContactEmail", () => {
  it("adresse valide, espaces retirés ; absente ou invalide : null", () => {
    expect(ivoneaContactEmail(" bonjour@ivonea.test ")).toBe("bonjour@ivonea.test");
    expect(ivoneaContactEmail(undefined)).toBeNull();
    expect(ivoneaContactEmail("")).toBeNull();
    expect(ivoneaContactEmail("pas une adresse")).toBeNull();
  });
});
