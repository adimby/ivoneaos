import "server-only";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { publicAppUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import { localDate } from "@/lib/time";
import { getContact } from "@/modules/crm/queries";
import { composeManualInstructions } from "@/modules/workspace/manual-instructions";
import { getCurrentWorkspace, getManualPayment, type Workspace } from "@/modules/workspace/queries";
import { invoiceDocument, parsePublicDocument, quoteDocument, type BillingDocument, type DraftSource } from "./document";
import { logoFormat, renderDocumentPdf, type Translate } from "./pdf";
import { downloadLogo, getInvoice, getQuote, type Invoice, type Quote } from "./queries";
import { pdfFileName, publicPath } from "./share";
import { documentView } from "./view";

// Document vu par le client, depuis l'application : la copie figée (comme la page
// publique) pour un document émis ; les données à jour du profil et du contact pour un
// brouillon (aperçu avant envoi).
export async function appDocument(
  workspace: Workspace,
  record: ({ type: "quote" } & Quote) | ({ type: "invoice" } & Invoice),
): Promise<BillingDocument | null> {
  if (record.status !== "draft") {
    const supabase = await createClient();
    const { data, error } =
      record.type === "quote"
        ? await supabase.rpc("get_public_quote", { token: record.public_token })
        : await supabase.rpc("get_public_invoice", { token: record.public_token });
    if (error) throw error;
    return parsePublicDocument(data);
  }

  const [contact, manual] = await Promise.all([getContact(workspace.id, record.contact_id), getManualPayment(workspace.id)]);
  const source: DraftSource = {
    freelancer: {
      business_name: workspace.name,
      logo_path: workspace.logo_path,
      nif: workspace.nif,
      stat: workspace.stat,
      tax_regime: workspace.tax_regime,
      address: workspace.address,
      invoice_footer: workspace.invoice_footer,
    },
    client: { name: contact?.name ?? "", company_name: contact?.company_name ?? null },
    lines: record.lines,
    manualInstructions: composeManualInstructions(manual),
  };
  return record.type === "quote" ? quoteDocument(record, source) : invoiceDocument(record, source);
}

// PDF dans la langue du document. logoAs : lecture du logo sans session (document émis,
// page publique) ou avec la session de la freelance (brouillon).
export async function documentPdf(
  doc: BillingDocument,
  { publicUrl, logoAs, now = new Date() }: { publicUrl: string | null; logoAs: "public" | "member"; now?: Date },
): Promise<Buffer> {
  const t = await getTranslations({ locale: doc.language, namespace: "Pdf" });
  const view = documentView(doc, { locale: doc.language, now, publicUrl });
  const format = logoFormat(view.freelancer.logoPath);
  const data = format && view.freelancer.logoPath ? await downloadLogo(view.freelancer.logoPath, logoAs) : null;
  return renderDocumentPdf(view, t as unknown as Translate, data && format ? { data, format } : null);
}

// PDF de la page publique : le lien circule (WhatsApp, e-mail) et chaque ouverture
// demanderait un rendu complet. Cache en mémoire du serveur, court et borné, par contenu
// exact du document (statut, paiements et version compris) et par jour à Madagascar (le
// statut « en retard » et les dates par défaut en dépendent) : un changement donne une
// autre clé, jamais un PDF périmé. Le PDF figé de l'application reste rendu à la demande.
const PUBLIC_PDF_TTL_MS = 10 * 60_000;
const PUBLIC_PDF_MAX = 50;
const publicPdfs = new Map<string, { pdf: Buffer; expires: number }>();

export async function publicDocumentPdf(doc: BillingDocument, publicUrl: string): Promise<Buffer> {
  const date = new Date();
  const key = createHash("sha256").update(JSON.stringify([doc, publicUrl, localDate(date)])).digest("base64url");
  const now = date.getTime();
  const hit = publicPdfs.get(key);
  if (hit && hit.expires > now) return hit.pdf;
  const pdf = await documentPdf(doc, { publicUrl, logoAs: "public", now: date });
  publicPdfs.delete(key);
  for (const [k, v] of publicPdfs) if (v.expires <= now) publicPdfs.delete(k);
  while (publicPdfs.size >= PUBLIC_PDF_MAX) publicPdfs.delete(publicPdfs.keys().next().value!);
  publicPdfs.set(key, { pdf, expires: now + PUBLIC_PDF_TTL_MS });
  return pdf;
}

export function pdfResponse(pdf: Buffer, doc: BillingDocument, download: boolean): Response {
  const name = pdfFileName(doc.number, doc.type);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// Aperçu et PDF depuis l'application (session de la freelance, RLS) : brouillon compris.
export async function appPdfResponse(
  kind: "quote" | "invoice",
  id: string,
  { origin, download }: { origin: string; download: boolean },
): Promise<Response> {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return new Response("Unauthorized", { status: 401 });
  const record =
    kind === "quote"
      ? await getQuote(workspace.id, id).then((q) => q && ({ type: "quote", ...q }) as const)
      : await getInvoice(workspace.id, id).then((i) => i && ({ type: "invoice", ...i }) as const);
  if (!record) return new Response("Not found", { status: 404 });
  const doc = await appDocument(workspace, record);
  if (!doc) return new Response("Not found", { status: 404 });
  const publicUrl = record.status === "draft" ? null : `${publicAppUrl() ?? origin}${publicPath(doc.language, record.public_token)}`;
  const pdf = await documentPdf(doc, { publicUrl, logoAs: "member" });
  return pdfResponse(pdf, doc, download);
}
