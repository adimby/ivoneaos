import "server-only";
import { cache } from "react";
import type { Currency } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getContactNames } from "@/modules/crm/queries";
import { parsePublicDocument, type BillingDocument, type Language } from "./document";
import type { InvoiceStatus, QuoteStatus } from "./status";

// Lectures de la facturation avec le client de la personne connectée (RLS : son
// workspace seulement). Les noms des clients viennent du module CRM.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIST_LIMIT = 200;

// Exposé aux autres modules (liste de démarrage) : au moins un devis, brouillon compris ?
export async function hasQuote(workspaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function withClients<T extends { contact_id: string }>(workspaceId: string, rows: T[]) {
  const names = await getContactNames(workspaceId, rows.map((r) => r.contact_id));
  return rows.map((row) => ({ ...row, client: names.get(row.contact_id) ?? null }));
}

export async function listQuotes(workspaceId: string) {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("quotes")
    .select("id, number, status, currency, total, valid_until, contact_id, created_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return { quotes: await withClients(workspaceId, data), total: count ?? data.length };
}

export async function listInvoices(workspaceId: string) {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("invoices")
    .select("id, number, status, currency, total, amount_paid, due_on, contact_id, created_at", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return { invoices: await withClients(workspaceId, data), total: count ?? data.length };
}

export type QuoteListItem = Awaited<ReturnType<typeof listQuotes>>["quotes"][number];
export type InvoiceListItem = Awaited<ReturnType<typeof listInvoices>>["invoices"][number];

// Devis d'une opportunité (page de l'opportunité), du plus récent au plus ancien.
export async function listDealQuotes(workspaceId: string, dealId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id, number, status, currency, total, valid_until")
    .eq("workspace_id", workspaceId)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

const LINE_COLUMNS = "id, position, description, quantity, unit_price, line_total";

// cache : lu une fois par requête (titre de la page et page elle-même).
export const getQuote = cache(async (workspaceId: string, id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select(
      `id, number, status, language, currency, valid_until, subtotal, discount, total, public_token, contact_id, deal_id,
       sent_at, accepted_at, updated_at, document_lines(${LINE_COLUMNS})`,
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .order("position", { referencedTable: "document_lines" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { document_lines: lines, ...quote } = data;
  return {
    ...quote,
    status: quote.status as QuoteStatus,
    language: quote.language as Language,
    currency: quote.currency as Currency,
    lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
  };
});

export type Quote = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

export const getInvoice = cache(async (workspaceId: string, id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `id, number, status, language, currency, exchange_rate, issued_on, due_on, subtotal, discount, total,
       amount_paid, paid_at, public_token, pdf_path, contact_id, quote_id, sent_at, document_lines(${LINE_COLUMNS})`,
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .order("position", { referencedTable: "document_lines" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { document_lines: lines, ...invoice } = data;
  return {
    ...invoice,
    status: invoice.status as InvoiceStatus,
    language: invoice.language as Language,
    currency: invoice.currency as Currency,
    exchange_rate: Number(invoice.exchange_rate),
    lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
  };
});

export type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

// Facture créée depuis un devis (hors facture annulée).
export async function getQuoteInvoice(workspaceId: string, quoteId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, status")
    .eq("workspace_id", workspaceId)
    .eq("quote_id", quoteId)
    .neq("status", "cancelled")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Numéro du devis d'origine d'une facture.
export async function getQuoteNumber(workspaceId: string, quoteId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("number")
    .eq("workspace_id", workspaceId)
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  return data?.number ?? null;
}

// ---------------------------------------------------------------------------
// Pages publiques : sans session, seulement les fonctions publiques de la base.
// ---------------------------------------------------------------------------
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export async function getPublicDocument(token: string): Promise<{ doc: BillingDocument; token: string } | null> {
  if (!TOKEN.test(token)) return null;
  const supabase = await createPublicClient();
  const quote = await supabase.rpc("get_public_quote", { token });
  if (quote.error) throw quote.error;
  const fromQuote = parsePublicDocument(quote.data);
  if (fromQuote) return { doc: fromQuote, token };
  const invoice = await supabase.rpc("get_public_invoice", { token });
  if (invoice.error) throw invoice.error;
  const fromInvoice = parsePublicDocument(invoice.data);
  return fromInvoice ? { doc: fromInvoice, token } : null;
}

// Logo d'un document : bucket privé « logos ». Pour un document émis, lisible sans
// session (règle is_public_logo) ; pour un brouillon, avec la session de la freelance.
export async function downloadLogo(path: string, as: "public" | "member"): Promise<Buffer | null> {
  const supabase = as === "public" ? await createPublicClient() : await createClient();
  const { data, error } = await supabase.storage.from("logos").download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function publicLogoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createPublicClient();
  const { data } = await supabase.storage.from("logos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
