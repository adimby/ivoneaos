import { describe, expect, it } from "vitest";
import { adminRequestEmail, decisionEmail } from "./emails";

describe("e-mails de la vérification fiscale", () => {
  it("avis aux admins : nom échappé, lien vers la demande", () => {
    const email = adminRequestEmail("ivonea@example.test", "Studio <Hery>", "https://app.test/fr/admin/verifications/1");
    expect(email.subject).toBe("Carte fiscale à vérifier : Studio <Hery>");
    expect(email.html).toContain("Studio &lt;Hery&gt;");
    expect(email.text).toContain("https://app.test/fr/admin/verifications/1");
  });

  it("refus : motif dans la langue de la freelance", () => {
    const fr = decisionEmail("a@example.test", "fr", { verified: false, reason: "Photo floue" }, "https://app.test/fr/reglages");
    expect(fr.subject).toBe("Ta carte fiscale n'a pas pu être vérifiée");
    expect(fr.text).toContain("Motif : Photo floue");
    const en = decisionEmail("a@example.test", "en", { verified: true }, "https://app.test/en/reglages");
    expect(en.subject).toBe("Your tax card is verified");
  });
});
