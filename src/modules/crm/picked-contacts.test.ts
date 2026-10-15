import { describe, expect, it } from "vitest";
import { pickedSchema, toContact } from "./picked-contacts";

describe("import du carnet", () => {
  it("premier numéro valide et premier e-mail valide", () => {
    expect(toContact({ name: ["", "Rakoto"], tel: ["abc", "034 12 345 67"], email: ["x", "Rakoto@Mail.MG "] })).toMatchObject({
      name: "Rakoto",
      phone: "+261341234567",
      email: "rakoto@mail.mg",
    });
  });
  it("sans nom : l'e-mail ou le numéro", () => {
    expect(toContact({ tel: ["0341234567"] })).toMatchObject({ name: "0341234567", phone: "+261341234567", email: null });
  });
  it("rien pour joindre : ignoré", () => {
    expect(toContact({ name: ["Sans numéro"], tel: ["12"], email: ["pas-un-email"] })).toBeNull();
  });
  it("envoi borné : 5 valeurs par champ, 320 caractères, 200 contacts", () => {
    expect(pickedSchema.safeParse([{ tel: Array(6).fill("0341234567") }]).success).toBe(false);
    expect(pickedSchema.safeParse([{ email: ["a".repeat(321)] }]).success).toBe(false);
    expect(pickedSchema.safeParse(Array(201).fill({ name: ["A"] })).success).toBe(false);
    expect(pickedSchema.safeParse([{ name: ["A"], tel: ["0341234567"] }]).success).toBe(true);
  });
});
