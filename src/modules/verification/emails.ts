import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import type { Email } from "@/lib/email";

// E-mails de la vérification fiscale (texte et HTML simple). Logique pure, testée sans réseau.

const MESSAGES = { fr, en };
type Locale = keyof typeof MESSAGES;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(paragraphs: string[], cta: { label: string; href: string }, footer: string) {
  const text = [...paragraphs, "", `${cta.label} : ${cta.href}`].join("\n\n").replace(/\n{3,}/g, "\n\n");
  const html = `<div style="font-family:system-ui,sans-serif;color:#0b2a2e;line-height:1.5">
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
<p><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#a45c36;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>
<p style="color:#45605f;font-size:13px">${escapeHtml(footer)}</p>
</div>`;
  return { text, html };
}

// Aux admins : une demande attend une vérification à la main (lien vers la page admin).
export function adminRequestEmail(to: string, workspaceName: string, link: string): Email {
  const t = createTranslator({ locale: "fr", messages: fr, namespace: "VerificationEmail" });
  const body = render([t("adminIntro", { name: workspaceName })], { label: t("adminCta"), href: link }, t("footer"));
  return { to, subject: t("adminSubject", { name: workspaceName }), ...body };
}

// À la freelance : résultat de la vérification, dans sa langue.
export function decisionEmail(
  to: string,
  locale: string | null,
  decision: { verified: boolean; reason?: string | null },
  link: string,
): Email {
  const lang: Locale = locale === "en" ? "en" : "fr";
  const t = createTranslator({ locale: lang, messages: MESSAGES[lang], namespace: "VerificationEmail" });
  const paragraphs = decision.verified
    ? [t("verifiedBody")]
    : [t("rejectedBody", { reason: decision.reason ?? "" }), t("rejectedNext")];
  const body = render(paragraphs, { label: t("cta"), href: link }, t("footer"));
  return { to, subject: decision.verified ? t("verifiedSubject") : t("rejectedSubject"), ...body };
}
