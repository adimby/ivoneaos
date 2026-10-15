import { describe, expect, it } from "vitest";
import { authErrorKey } from "./errors";

describe("authErrorKey", () => {
  it("code faux ou expiré", () => {
    expect(authErrorKey({ code: "otp_expired", status: 403 })).toBe("code_invalid");
  });
  it("trop de demandes", () => {
    expect(authErrorKey({ code: "over_email_send_rate_limit", status: 429 })).toBe("rate_limited");
    expect(authErrorKey({ code: "over_request_rate_limit" })).toBe("rate_limited");
    expect(authErrorKey({ status: 429 })).toBe("rate_limited");
  });
  it("adresse refusée", () => {
    expect(authErrorKey({ code: "email_address_invalid", status: 400 })).toBe("invalid_email");
  });
  it("autre erreur", () => {
    expect(authErrorKey({ code: "unexpected_failure", status: 500 })).toBe("unknown");
    expect(authErrorKey(null)).toBe("unknown");
  });
});
