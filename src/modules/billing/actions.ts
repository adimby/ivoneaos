"use server";

import { after } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { appOrigin } from "@/lib/app-url";
import { dbErrorKey } from "@/lib/db-errors";
import { sendEmail } from "@/lib/email";
import type { FieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { localDate } from "@/lib/time";
import { markDealWon } from "@/modules/crm/deal-won";
import { getContact, getDeal } from "@/modules/crm/queries";
import { ensureInvoicePapiLink, type PayableInvoice } from "@/modules/payments/papi/service";
import { ensureInvoiceWhopLink, retireInvoiceWhopLinks } from "@/modules/payments/whop/service";
import { canUseNow, getCurrentWorkspace, isOnboarded, type Workspace } from "@/modules/workspace/queries";
import { safeNextPath } from "@/modules/auth/next-path";
import { hasFiscalInfo } from "@/modules/workspace/profile-schema";
import { invoiceSendBlock } from "@/modules/verification/queries";
import { documentEmail } from "./email";
import { PAYABLE_COLUMNS, payableInvoice } from "./payment-link";
import { appDocument, documentPdf } from "./render";
import { getInvoice, getQuote } from "./queries";
import { parseDocumentForm, readDocumentForm } from "./schemas";
import { pdfFileName, publicPath } from "./share";

export type DocumentFormState = {
  fieldErrors?: FieldErrors;
  // Clé errors.db.* ou fix_errors.
  formError?: string;
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

// Personne connectée et workspace prêt, sinon redirection (la session a pu expirer
// pendant que la page était ouverte : connexion, puis retour à la page).
async function context(formData: FormData) {
  const locale: Locale = localeSchema.parse(formData.get("locale"));
  const back = safeNextPath(String(formData.get("back") ?? ""));
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return redirect({ href: back ? `/connexion?next=${encodeURIComponent(back)}` : "/connexion", locale });
  }
  const workspace = await getCurrentWorkspace();
  if (!workspace || !isOnboarded(workspace)) return redirect({ href: "/demarrage", locale });
  // E-mail du compte : adresse de réponse des documents envoyés au client.
  const email = typeof claims.claims.email === "string" ? claims.claims.email : null;
  return { supabase, locale, workspace, email };
}

function readId(formData: FormData, key = "id"): string | null {
  const parsed = idSchema.safeParse(formData.get(key));
  return parsed.success ? parsed.data : null;
}

// Retour à la page du document, avec un message (?erreur=<clé errors.db.*> ou ?ok=<clé>).
function backTo(locale: Locale, path: string, params: Record<string, string> = {}): never {
  const query = new URLSearchParams(params).toString();
  return redirect({ href: query ? `${path}?${query}` : path, locale });
}

const today = () => localDate(new Date());

// ---------------------------------------------------------------------------
// Création et modification (en-tête et lignes en une transaction : save_quote, save_invoice)
// ---------------------------------------------------------------------------

export async function saveQuote(_prev: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const { supabase, locale, workspace } = await context(formData);
  const parsed = parseDocumentForm(readDocumentForm(formData, "quote"), {
    today: today(),
    defaultCurrency: workspace.default_currency,
  });
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };
  const data = parsed.data;
  const id = readId(formData);

  let contactId = data.contact_id;
  let dealId: string | null = null;
  if (id) {
    // Modification : l'opportunité liée est celle enregistrée sur le devis (jamais
    // recalculée depuis le formulaire : une opportunité archivée depuis ne le détache
    // pas), et le client reste le sien quand le devis vient d'une opportunité.
    const existing = await getQuote(workspace.id, id);
    if (!existing) return { formError: "unknown" };
    dealId = existing.deal_id;
    if (dealId) contactId = existing.contact_id;
    if (contactId !== existing.contact_id && !(await isActiveContact(workspace, contactId))) {
      return { fieldErrors: { contact_id: "invalid_choice" }, formError: "fix_errors" };
    }
  } else {
    // Devis depuis une opportunité : le client est celui de l'opportunité.
    if (data.deal_id) {
      const deal = await getDeal(workspace.id, data.deal_id);
      if (deal) {
        dealId = deal.id;
        contactId = deal.contact_id;
      }
    }
    if (!(await isActiveContact(workspace, contactId))) {
      return { fieldErrors: { contact_id: "invalid_choice" }, formError: "fix_errors" };
    }
  }

  const { data: quoteId, error } = await supabase.rpc("save_quote", {
    p_workspace_id: workspace.id,
    p_contact_id: contactId,
    p_currency: data.currency,
    p_valid_until: data.date,
    p_discount: data.discount,
    p_language: data.language,
    p_lines: data.lines.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
    // Toujours transmis : en modification, save_quote réécrit deal_id avec cette valeur.
    p_deal_id: dealId ?? undefined,
    ...(id && { p_id: id }),
  });
  if (error) return { formError: dbErrorKey(error) };
  if (!quoteId) return { formError: "unknown" };
  return redirect({ href: `/devis/${quoteId}`, locale });
}

export async function saveInvoice(_prev: DocumentFormState, formData: FormData): Promise<DocumentFormState> {
  const { supabase, locale, workspace } = await context(formData);
  const parsed = parseDocumentForm(readDocumentForm(formData, "invoice"), {
    today: today(),
    defaultCurrency: workspace.default_currency,
  });
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };
  const data = parsed.data;
  const id = readId(formData);
  // Client vérifié à la création, et en modification s'il change (champ caché modifié,
  // client archivé entre-temps).
  const existing = id ? await getInvoice(workspace.id, id) : null;
  if (id && !existing) return { formError: "unknown" };
  if (data.contact_id !== existing?.contact_id && !(await isActiveContact(workspace, data.contact_id))) {
    return { fieldErrors: { contact_id: "invalid_choice" }, formError: "fix_errors" };
  }

  const { data: invoiceId, error } = await supabase.rpc("save_invoice", {
    p_workspace_id: workspace.id,
    p_contact_id: data.contact_id,
    p_currency: data.currency,
    p_exchange_rate: data.exchange_rate,
    p_due_on: data.date,
    p_discount: data.discount,
    p_language: data.language,
    p_lines: data.lines.map(({ description, quantity, unit_price }) => ({ description, quantity, unit_price })),
    ...(id && { p_id: id }),
  });
  if (error) return { formError: dbErrorKey(error) };
  if (!invoiceId) return { formError: "unknown" };
  return redirect({ href: `/factures/${invoiceId}`, locale });
}

async function isActiveContact(workspace: Workspace, contactId: string): Promise<boolean> {
  const contact = await getContact(workspace.id, contactId);
  return Boolean(contact && !contact.archived_at);
}

// ---------------------------------------------------------------------------
// Envoi : le document quitte le brouillon, la base attribue le numéro (sans trou) et
// applique la limite de l'offre Découverte (free_limit_reached, message traduit).
// ---------------------------------------------------------------------------

export async function sendQuote(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  if (!id) return;
  const path = `/devis/${id}`;
  // Offre Découverte : seul un brouillon qui part compte (un devis expiré renvoyé garde son numéro).
  if (!(await canUseNow(workspace, "send_document")) && (await getQuote(workspace.id, id))?.status === "draft") {
    backTo(locale, path, { erreur: "free_limit_reached" });
  }
  // Brouillon, ou devis expiré renvoyé (avec une nouvelle validité).
  const { data, error } = await supabase
    .from("quotes")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .in("status", ["draft", "expired"])
    .select("id");
  if (error) backTo(locale, path, { erreur: dbErrorKey(error) });
  if (!data?.length) backTo(locale, path, { erreur: "invalid_status_transition" });
  backTo(locale, path, { ok: "sent" });
}

export async function sendInvoice(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  if (!id) return;
  const path = `/factures/${id}`;
  // NIF, STAT et régime fiscal manquants : la page les demande (la base refuserait aussi).
  if (!hasFiscalInfo(workspace)) backTo(locale, path, { erreur: "workspace_tax_info_missing" });
  // Plafond de 3 factures tant que la carte fiscale n'est pas vérifiée, puis offre
  // Découverte (message le plus utile d'abord : changer d'offre ne lèverait pas le premier).
  // Seul un brouillon qui part compte (facture déjà envoyée resoumise : refus de transition
  // habituel, pas de message de limite).
  const fiscalBlock = await invoiceSendBlock(workspace);
  const blocked = fiscalBlock ?? ((await canUseNow(workspace, "send_document")) ? null : "free_limit_reached");
  if (blocked && (await getInvoice(workspace.id, id))?.status === "draft") backTo(locale, path, { erreur: blocked });
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .eq("status", "draft")
    .select(PAYABLE_COLUMNS);
  if (error) {
    // Plafond atteint entre le contrôle ci-dessus et l'envoi (autre facture partie en même
    // temps) : carte déjà déposée → message « en cours de vérification ».
    const key = dbErrorKey(error);
    const pending = key === "fiscal_verification_required" && workspace.fiscal_status === "pending";
    backTo(locale, path, { erreur: pending ? "fiscal_verification_pending" : key });
  }
  if (!data?.length) backTo(locale, path, { erreur: "invalid_status_transition" });
  // Facture en ariary et Papi connecté : lien de paiement créé maintenant (spec P5.5).
  // En cas d'échec, la facture reste envoyée avec les coordonnées manuelles ; la page
  // publique retentera à l'ouverture par le client.
  // Facture en euros ou dollars et Whop connecté : paiement par carte préparé de même.
  const invoice = payableInvoice(data[0], await appOrigin());
  const papi = await createPapiLink(invoice);
  const whop = await createWhopLink(invoice);
  // Archivage du PDF après la réponse : la freelance n'attend pas le rendu et le
  // téléversement (connexion lente) ; la facture est déjà envoyée.
  after(() => archiveInvoicePdf(workspace, id));
  backTo(locale, path, { ok: "sent", ...(papi && { papi }), ...(whop && { whop }) });
}

// null : lien prêt ou Papi non concerné ; sinon la raison de l'échec (?papi=…).
async function createPapiLink(invoice: PayableInvoice): Promise<string | null> {
  try {
    const outcome = await ensureInvoicePapiLink(invoice, { origin: new URL(invoice.publicUrl).origin });
    return outcome.status === "failed" ? outcome.reason : null;
  } catch (error) {
    console.error("[billing] lien Papi non créé", error instanceof Error ? error.message : "");
    return "unavailable";
  }
}

// null : paiement par carte prêt ou Whop non concerné ; sinon « failed » (?whop=failed).
async function createWhopLink(invoice: PayableInvoice): Promise<string | null> {
  try {
    const outcome = await ensureInvoiceWhopLink(invoice, { origin: new URL(invoice.publicUrl).origin });
    return outcome.status === "failed" ? "failed" : null;
  } catch (error) {
    console.error("[billing] paiement Whop non créé", error instanceof Error ? error.message : "");
    return "failed";
  }
}

// Copie PDF de la facture émise, conservée dans le bucket « documents » (nom nouveau à
// chaque génération, pdf_path posé une seule fois). Sans effet bloquant : la facture est
// déjà envoyée, et le PDF reste générable à la demande depuis sa copie figée.
async function archiveInvoicePdf(workspace: Workspace, id: string) {
  try {
    const invoice = await getInvoice(workspace.id, id);
    if (!invoice || invoice.pdf_path) return;
    const doc = await appDocument(workspace, { type: "invoice", ...invoice });
    if (!doc) return;
    const origin = await appOrigin();
    const pdf = await documentPdf(doc, { publicUrl: `${origin}${publicPath(doc.language, invoice.public_token)}`, logoAs: "member" });
    const supabase = await createClient();
    const path = `${workspace.id}/${Date.now().toString(36)}-${pdfFileName(doc.number, "invoice")}`;
    const upload = await supabase.storage
      .from("documents")
      .upload(path, new Uint8Array(pdf), { contentType: "application/pdf", upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await supabase.from("invoices").update({ pdf_path: path }).eq("id", id).is("pdf_path", null);
    if (error) throw error;
  } catch (error) {
    console.error("[billing] PDF de la facture non archivé", error);
  }
}

// ---------------------------------------------------------------------------
// Devis : accepté ou refusé (par la freelance), puis transformé en facture.
// ---------------------------------------------------------------------------

const quoteDecision = z.enum(["accepted", "declined"]);

export async function decideQuote(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  const status = quoteDecision.safeParse(formData.get("status"));
  if (!id || !status.success) return;
  const path = `/devis/${id}`;
  // Acceptation : la base passe l'opportunité liée à « gagné » (trigger).
  const { data, error } = await supabase
    .from("quotes")
    .update({ status: status.data })
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .eq("status", "sent")
    .select("id");
  if (error) backTo(locale, path, { erreur: dbErrorKey(error) });
  if (!data?.length) backTo(locale, path, { erreur: "invalid_status_transition" });
  backTo(locale, path, { ok: status.data });
}

export async function convertQuote(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  if (!id) return;
  const quote = await getQuote(workspace.id, id);
  if (!quote) return;
  const { data: invoiceId, error } = await supabase.rpc("create_invoice_from_quote", { p_quote_id: id });
  if (error) backTo(locale, `/devis/${id}`, { erreur: dbErrorKey(error) });
  if (!invoiceId) backTo(locale, `/devis/${id}`, { erreur: "unknown" });
  // La facture existe : un échec ici ne doit pas masquer la redirection vers elle. Le
  // trigger d'acceptation a déjà passé l'opportunité à « gagné » ; ceci la rétablit.
  if (quote.deal_id) {
    try {
      await markDealWon(workspace.id, quote.deal_id);
    } catch (dealError) {
      console.error("[billing] opportunité non passée à « gagné »", dealError);
    }
  }
  backTo(locale, `/factures/${invoiceId}`, { ok: "converted" });
}

// ---------------------------------------------------------------------------
// Factures : payée à la main (paiement manuel du reste dû), annulée.
// ---------------------------------------------------------------------------

const manualMethod = z.enum(["manual", "MVOLA", "ORANGE_MONEY", "AIRTEL_MONEY"]).catch("manual");

export async function markInvoicePaid(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  if (!id) return;
  const path = `/factures/${id}`;
  const invoice = await getInvoice(workspace.id, id);
  if (!invoice) return;
  const due = invoice.total - invoice.amount_paid;
  if (!(invoice.status === "sent" || invoice.status === "overdue") || due <= 0) {
    backTo(locale, path, { erreur: "invalid_status_transition" });
  }
  // La facture passe à « payée » d'elle-même quand le total est couvert.
  const { error } = await supabase.from("payments").insert({
    workspace_id: workspace.id,
    invoice_id: id,
    provider: "manual",
    method: manualMethod.parse(formData.get("method")),
    amount: due,
    currency: invoice.currency,
  });
  if (error) backTo(locale, path, { erreur: dbErrorKey(error) });
  await retireWhopLinks(id);
  backTo(locale, path, { ok: "paid" });
}

// Facture réglée à la main ou annulée : le paiement par carte Whop encore ouvert (onglet
// resté ouvert chez le client) est retiré, pour ne pas encaisser un montant déjà réglé.
// Sans effet bloquant : la facture est déjà à jour.
async function retireWhopLinks(invoiceId: string) {
  try {
    await retireInvoiceWhopLinks(invoiceId);
  } catch (error) {
    console.error("[billing] paiement Whop non retiré", error instanceof Error ? error.message : "");
  }
}

export async function cancelInvoice(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  if (!id) return;
  const path = `/factures/${id}`;
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .in("status", ["sent", "overdue"])
    .select("id");
  if (error) backTo(locale, path, { erreur: dbErrorKey(error) });
  if (!data?.length) backTo(locale, path, { erreur: "invalid_status_transition" });
  await retireWhopLinks(id);
  backTo(locale, path, { ok: "cancelled" });
}

// Brouillon supprimé (un document émis ne se supprime jamais : règle en base).
export async function deleteDraft(formData: FormData) {
  const { supabase, locale, workspace } = await context(formData);
  const id = readId(formData);
  const kind = formData.get("kind") === "invoice" ? "invoice" : "quote";
  if (!id) return;
  const table = kind === "quote" ? "quotes" : "invoices";
  const { error } = await supabase.from(table).delete().eq("id", id).eq("workspace_id", workspace.id).eq("status", "draft");
  if (error) backTo(locale, kind === "quote" ? `/devis/${id}` : `/factures/${id}`, { erreur: dbErrorKey(error) });
  backTo(locale, kind === "quote" ? "/factures?vue=devis" : "/factures", { ok: "deleted" });
}

// ---------------------------------------------------------------------------
// Partage par e-mail (Resend ; sans RESEND_API_KEY rien n'est envoyé : la page propose
// alors l'e-mail depuis le téléphone).
// ---------------------------------------------------------------------------

export async function emailDocument(formData: FormData) {
  const { supabase, locale, workspace, email } = await context(formData);
  const id = readId(formData);
  if (!id) return;
  const isQuote = formData.get("kind") !== "invoice";
  const path = isQuote ? `/devis/${id}` : `/factures/${id}`;
  const quote = isQuote ? await getQuote(workspace.id, id) : null;
  const invoice = isQuote ? null : await getInvoice(workspace.id, id);
  const record = quote ?? invoice;
  if (!record || record.status === "draft") return;
  const contact = await getContact(workspace.id, record.contact_id);
  const to = contact?.email;
  if (!to) backTo(locale, path, { email: "no_email" });

  const doc = quote
    ? await appDocument(workspace, { type: "quote", ...quote })
    : await appDocument(workspace, { type: "invoice", ...invoice! });
  if (!doc) return;
  const url = `${await appOrigin()}${publicPath(doc.language, record.public_token)}`;
  const t = await getTranslations({ locale: doc.language, namespace: "Share" });
  // Au plus un e-mail par document toutes les 2 minutes (double appui, envois en rafale
  // depuis le domaine Ivonea). Sans clé Resend rien ne part : pas de limite à poser.
  let claimed: string | null = null;
  if (process.env.RESEND_API_KEY) {
    const { data, error } = await supabase.rpc("claim_document_email", { p_document_id: id });
    if (error) backTo(locale, path, { email: "failed" });
    if (!data) backTo(locale, path, { email: "throttled" });
    claimed = data;
  }
  // Le client répond à la freelance ; son nom commercial apparaît dans l'expéditeur.
  const result = await sendEmail({
    to,
    ...documentEmail(doc, url, t as unknown as Parameters<typeof documentEmail>[2]),
    fromName: workspace.name,
    replyTo: email ?? undefined,
  });
  // Rien n'est parti : la réservation est rendue, nouvel essai possible tout de suite.
  if (result === "failed" && claimed) {
    await supabase.rpc("release_document_email", { p_document_id: id, p_claimed_at: claimed });
  }
  backTo(locale, path, { email: result });
}

// ---------------------------------------------------------------------------
// Page publique : le client accepte la version du devis qu'il a vue (sans compte).
// ---------------------------------------------------------------------------

export async function acceptQuotePublic(formData: FormData) {
  const locale: Locale = localeSchema.parse(formData.get("locale"));
  const token = String(formData.get("token") ?? "");
  const version = String(formData.get("version") ?? "");
  if (!TOKEN.test(token)) return;
  const supabase = await createPublicClient();
  const { data, error } = await supabase.rpc("accept_quote", { token, version });
  const result = error ? "error" : data;
  redirect({ href: `/p/${token}?r=${encodeURIComponent(result)}`, locale });
}
