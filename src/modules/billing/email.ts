import { formatMoney } from "@/lib/money";
import type { BillingDocument } from "./document";

// Message envoyé au client (WhatsApp, e-mail), dans la langue du document.
type Translate = (key: string, values?: Record<string, string>) => string;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function values(doc: BillingDocument, url: string) {
  return {
    client: doc.client.name,
    number: doc.number ?? "",
    business: doc.freelancer.business_name,
    total: formatMoney(doc.total, doc.currency, doc.language),
    url,
  };
}

export function shareMessage(doc: BillingDocument, url: string, t: Translate): string {
  return t(doc.type === "quote" ? "quoteMessage" : "invoiceMessage", values(doc, url));
}

export function documentEmail(doc: BillingDocument, url: string, t: Translate) {
  const v = values(doc, url);
  const subject = t(doc.type === "quote" ? "quoteSubject" : "invoiceSubject", v);
  const message = shareMessage(doc, url, t);
  const cta = t(doc.type === "quote" ? "quoteCta" : "invoiceCta");
  const text = `${message}\n\n${t("footer")}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b2a2e;max-width:520px">
<p style="font-size:18px;font-weight:700;color:#01515a">${escapeHtml(v.business)}</p>
<p>${escapeHtml(message.replace(url, "").trim())}</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#a45c36;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a></p>
<p style="color:#45605f;font-size:13px">${escapeHtml(t("footer"))}</p>
</div>`;
  return { subject, text, html };
}
