import "server-only";
import { createClient } from "@/lib/supabase/server";
import { favouriteCountries } from "./countries";
import { phoneSearchDigits } from "./phone";
import { containsPattern, searchTerm } from "./search";
import { todayCutoff } from "./reminder-dates";
import { sortStages, type Stage } from "./stages";

// Lectures du CRM avec le client de la personne connectée (RLS : son workspace seulement).

// Exposé aux autres modules (liste de démarrage) : au moins un contact actif ?
export async function hasActiveContact(workspaceId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// Pays proposés en tête du choix du pays : Madagascar, puis les 5 pays les plus utilisés
// par les contacts actifs du workspace (fonction SQL contact_top_countries, RLS appliquée).
export async function getFavouriteCountries(workspaceId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("contact_top_countries", { p_workspace_id: workspaceId });
  if (error) throw error;
  return favouriteCountries(data.map((row) => row.country));
}

export const CONTACT_LIST_LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Recherche : nom, entreprise, e-mail et étiquettes (champ calculé search_text), et
// numéro saisi avec ou sans indicatif.
export async function listContacts(workspaceId: string, query = "") {
  const supabase = await createClient();
  let request = supabase
    .from("contacts")
    .select("id, name, company_name, phone, email, tags", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("name")
    .limit(CONTACT_LIST_LIMIT);
  const term = searchTerm(query);
  if (term) {
    const filters = [`search_text.ilike.${containsPattern(term)}`];
    const digits = phoneSearchDigits(query);
    if (digits) filters.push(`phone.ilike.*${digits}*`);
    request = request.or(filters.join(","));
  }
  const { data, count, error } = await request;
  if (error) throw error;
  return { contacts: data, total: count ?? data.length };
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>["contacts"][number];

// null : identifiant mal formé ou contact d'un autre workspace (RLS).
export async function getContact(workspaceId: string, id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, kind, name, company_name, phone, email, country, tags, archived_at")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type Contact = NonNullable<Awaited<ReturnType<typeof getContact>>>;

export const CONTACT_OPTIONS_LIMIT = 500;

// Contacts actifs pour le choix du contact d'une opportunité (les CONTACT_OPTIONS_LIMIT
// premiers par nom, et le total). includeId : contact prérempli (?contact=), toujours
// proposé s'il est actif, même au-delà de la limite.
export async function listContactOptions(workspaceId: string, includeId?: string) {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("contacts")
    .select("id, name, company_name", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("name")
    .limit(CONTACT_OPTIONS_LIMIT);
  if (error) throw error;
  const total = count ?? data.length;
  if (includeId && UUID.test(includeId) && !data.some((c) => c.id === includeId)) {
    const { data: extra, error: extraError } = await supabase
      .from("contacts")
      .select("id, name, company_name")
      .eq("workspace_id", workspaceId)
      .eq("id", includeId)
      .is("archived_at", null)
      .maybeSingle();
    if (extraError) throw extraError;
    if (extra) data.unshift(extra);
  }
  return { contacts: data, total };
}

export async function listStages(workspaceId: string): Promise<Stage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, name, position, kind")
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return sortStages(data);
}

const DEAL_COLUMNS = "id, title, amount, currency, stage_id, expected_close_on, contact_id, contacts(id, name, company_name, archived_at)";

export const PIPELINE_LIMIT = 500;

// Pipeline : opportunités non archivées dont le contact n'est pas archivé non plus (les
// PIPELINE_LIMIT plus récentes, et le total).
export async function listDeals(workspaceId: string) {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("deals")
    .select("id, title, amount, currency, stage_id, expected_close_on, contact_id, contacts!inner(id, name, company_name)", {
      count: "exact",
    })
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .is("contacts.archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(PIPELINE_LIMIT);
  if (error) throw error;
  return { deals: data, total: count ?? data.length };
}

// Nombre et total (par devise) de chaque étape, sur toutes les opportunités du pipeline,
// pas seulement celles affichées (fonction SQL pipeline_totals).
export async function listPipelineTotals(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pipeline_totals", { p_workspace_id: workspaceId });
  if (error) throw error;
  return data;
}

export type PipelineTotal = Awaited<ReturnType<typeof listPipelineTotals>>[number];

export type DealListItem = Awaited<ReturnType<typeof listDeals>>["deals"][number];

export async function listContactDeals(workspaceId: string, contactId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDeal(workspaceId: string, id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .select(`${DEAL_COLUMNS}, archived_at`)
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type Deal = NonNullable<Awaited<ReturnType<typeof getDeal>>>;

export const TIMELINE_LIMIT = 100;

// Historique, du plus récent au plus ancien (les TIMELINE_LIMIT derniers, et le total).
export async function listActivities(workspaceId: string, about: { contactId: string } | { dealId: string }) {
  const supabase = await createClient();
  let request = supabase
    .from("activities")
    .select("id, kind, body, occurred_at, deal_id, deals(title)", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(TIMELINE_LIMIT);
  request = "contactId" in about ? request.eq("contact_id", about.contactId) : request.eq("deal_id", about.dealId);
  const { data, count, error } = await request;
  if (error) throw error;
  return { activities: data, total: count ?? data.length };
}

export type Activity = Awaited<ReturnType<typeof listActivities>>["activities"][number];

const REMINDER_COLUMNS = "id, title, due_at, contact_id, deal_id, contacts(name), deals(title)";

// Rappels non faits d'un contact ou d'une opportunité, du plus proche au plus lointain.
// Hors rappels liés à une opportunité ou un contact archivés (champ calculé about_active).
export async function listPendingReminders(workspaceId: string, about: { contactId: string } | { dealId: string }) {
  const supabase = await createClient();
  let request = supabase
    .from("reminders")
    .select(REMINDER_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("done_at", null)
    .is("about_active", true)
    .order("due_at")
    .limit(50);
  request = "contactId" in about ? request.eq("contact_id", about.contactId) : request.eq("deal_id", about.dealId);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export const TODAY_LIMIT = 50;

// « Aujourd'hui » (tableau de bord) : non faits, échéance aujourd'hui ou en retard, hors
// contacts et opportunités archivés ; les TODAY_LIMIT plus anciens, et le total.
export async function listTodayReminders(workspaceId: string, now: Date) {
  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("reminders")
    .select(REMINDER_COLUMNS, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("done_at", null)
    .is("about_active", true)
    .lt("due_at", todayCutoff(now).toISOString())
    .order("due_at")
    .limit(TODAY_LIMIT);
  if (error) throw error;
  return { reminders: data, total: count ?? data.length };
}

export type Reminder = Awaited<ReturnType<typeof listTodayReminders>>["reminders"][number];

// Exposé aux autres modules (listes de devis et factures) : nom et entreprise des
// contacts demandés, archivés compris (un document reste lié à son client).
export async function getContactNames(workspaceId: string, ids: string[]) {
  const unique = [...new Set(ids)].filter((id) => UUID.test(id));
  const names = new Map<string, { name: string; company_name: string | null }>();
  if (unique.length === 0) return names;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, company_name")
    .eq("workspace_id", workspaceId)
    .in("id", unique);
  if (error) throw error;
  data.forEach((c) => names.set(c.id, { name: c.name, company_name: c.company_name }));
  return names;
}
