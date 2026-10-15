import { describe, expect, it } from "vitest";
import { dbErrorKey } from "./db-errors";

describe("dbErrorKey", () => {
  it("renvoie la clé traduite levée par la base", () => {
    expect(dbErrorKey({ code: "55000", message: "default_currency_locked" })).toBe("default_currency_locked");
  });
  it("renvoie unknown pour une erreur brute", () => {
    expect(dbErrorKey({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe("unknown");
    expect(dbErrorKey(null)).toBe("unknown");
  });
});
