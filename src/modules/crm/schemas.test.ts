import { describe, expect, it } from "vitest";
import { parseWith } from "@/lib/forms";
import { activitySchema, contactSchema, dealSchema } from "./schemas";

const contact = { name: "Rakoto", kind: "person", company_name: "", phone: "", email: "", country: "MG", tags: "" };

describe("contactSchema", () => {
  it("3 champs suffisent : nom, téléphone normalisé, entreprise facultative", () => {
    const result = parseWith(contactSchema, { ...contact, phone: "034 12 345 67" });
    expect(result).toEqual({
      ok: true,
      data: { ...contact, phone: "+261341234567", email: null, company_name: null, tags: [] },
    });
  });
  it("téléphone ou e-mail obligatoire", () => {
    expect(parseWith(contactSchema, contact)).toEqual({ ok: false, fieldErrors: { phone: "reachable_required" } });
  });
  it("formats refusés", () => {
    const result = parseWith(contactSchema, { ...contact, name: " ", phone: "12", email: "pas-un-email" });
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "required", phone: "phone_format", email: "email_format" },
    });
  });
  it("étiquettes sans doublon", () => {
    const result = parseWith(contactSchema, { ...contact, email: "A@B.mg", tags: "client, vip , client," });
    expect(result.ok && result.data).toMatchObject({ email: "a@b.mg", tags: ["client", "vip"] });
  });
});

describe("dealSchema", () => {
  const deal = {
    title: "Logo",
    contact_id: "4b0f6a3e-0d0a-4a8b-9d6e-1f2a3b4c5d6e",
    stage_id: "5c1f6a3e-0d0a-4a8b-9d6e-1f2a3b4c5d6e",
    currency: "MGA",
    amount: "450 000",
    expected_close_on: "",
  };
  it("montant en unités mineures", () => {
    const result = parseWith(dealSchema, deal);
    expect(result.ok && result.data).toMatchObject({ amount: 450000, expected_close_on: null });
    const eur = parseWith(dealSchema, { ...deal, currency: "EUR", amount: "1 200,50" });
    expect(eur.ok && eur.data.amount).toBe(120050);
  });
  it("montant facultatif, mais valide", () => {
    const empty = parseWith(dealSchema, { ...deal, amount: "" });
    expect(empty.ok && empty.data.amount).toBeNull();
    expect(parseWith(dealSchema, { ...deal, amount: "4,5" })).toEqual({ ok: false, fieldErrors: { amount: "amount_format" } });
  });
  it("euros : « 1.200 » (3 chiffres après le point) refusé, jamais lu 1,20 €", () => {
    expect(parseWith(dealSchema, { ...deal, currency: "EUR", amount: "1.200" })).toEqual({
      ok: false,
      fieldErrors: { amount: "amount_format" },
    });
    const cents = parseWith(dealSchema, { ...deal, currency: "EUR", amount: "1.20" });
    expect(cents.ok && cents.data.amount).toBe(120);
  });
  it("étape facultative (création : première étape ouverte)", () => {
    const result = parseWith(dealSchema, { ...deal, stage_id: "" });
    expect(result.ok && result.data.stage_id).toBeNull();
  });
});

describe("activitySchema", () => {
  it("date saisie en heure de Madagascar", () => {
    const result = parseWith(activitySchema, { kind: "call", body: "Appel", occurred_at: "2026-10-15T09:00" });
    expect(result.ok && result.data.occurred_at.toISOString()).toBe("2026-10-15T06:00:00.000Z");
  });
});
