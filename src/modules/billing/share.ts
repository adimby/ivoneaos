import type { Language } from "./document";

// Lien court de la page publique, dans la langue du document (le client peut en changer).
export function publicPath(language: Language, token: string): string {
  return `/${language}/p/${token}`;
}

// Partage WhatsApp avec message prérempli : vers le numéro du client s'il est connu
// (chiffres seulement, indicatif compris), sinon WhatsApp propose de choisir le contact.
export function whatsappShareUrl(phone: string | null | undefined, text: string): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string | null | undefined, subject: string, body: string): string {
  return `mailto:${email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Nom de fichier du PDF : « D-2026-0001.pdf », « brouillon-devis.pdf ».
export function pdfFileName(number: string | null, kind: "quote" | "invoice"): string {
  return `${number ?? (kind === "quote" ? "devis-brouillon" : "facture-brouillon")}.pdf`;
}
