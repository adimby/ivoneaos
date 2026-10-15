"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { dbErrorKey } from "@/lib/db-errors";
import { formValues, parseWith, type FieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { toLocalInputValue } from "@/lib/time";
import { safeNextPath } from "@/modules/auth/next-path";
import { getCurrentWorkspace, isOnboarded } from "@/modules/workspace/queries";
import { pickedSchema, toContact } from "./picked-contacts";
import { quickDueAt, QUICK_CHOICES, snoozeDueAt, SNOOZE_DAYS, type SnoozeDays } from "./reminder-dates";
import {
  ACTIVITY_FIELDS,
  activitySchema,
  CONTACT_FIELDS,
  contactSchema,
  DEAL_FIELDS,
  dealSchema,
  reminderSchema,
} from "./schemas";

export type CrmFormState = {
  status?: "saved";
  // Change à chaque enregistrement réussi : le formulaire se vide.
  savedAt?: number;
  fieldErrors?: FieldErrors;
  // Clé errors.db.* ou FormErrors.fix_errors.
  formError?: string;
};

const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
const idSchema = z.uuid();

// Personne connectée et workspace prêt, sinon redirection. La session peut avoir expiré
// pendant que le formulaire était ouvert : connexion, puis retour à la page (champ back).
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
  return { supabase, locale, back, workspaceId: workspace.id };
}

// Après un changement fait par un simple formulaire (étape, rappel fait ou repoussé).
// Avec JavaScript (requête avec l'en-tête next-action) : la page se met à jour sur place.
// Avant son chargement (envoi natif du formulaire) : la réponse d'une action avec rendu
// partiel n'affiche pas la page, donc redirection (303) vers la page d'origine.
async function settle(locale: Locale, back: string | null) {
  if (back && !(await headers()).has("next-action")) return redirect({ href: back, locale });
  refresh();
}

function readId(formData: FormData, key: string): string | null {
  const parsed = idSchema.safeParse(formData.get(key));
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function saveContact(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const { supabase, locale, workspaceId } = await context(formData);
  const parsed = parseWith(contactSchema, formValues(formData, CONTACT_FIELDS));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };

  const id = readId(formData, "id");
  // Contact archivé : non modifiable (le désarchiver d'abord).
  const { data, error } = id
    ? await supabase
        .from("contacts")
        .update(parsed.data)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .select("id")
        .single()
    : await supabase
        .from("contacts")
        .insert({ ...parsed.data, workspace_id: workspaceId })
        .select("id")
        .single();
  // Offre Découverte : la base refuse le 21e contact actif (contact_limit_reached).
  if (error) return { formError: dbErrorKey(error) };
  return redirect({ href: `/contacts/${data.id}`, locale });
}

export async function archiveContact(formData: FormData) {
  const { supabase, locale, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("contacts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (error) throw error;
  redirect({ href: `/contacts?archive=${id}`, locale });
}

// Annuler l'archivage (ou désarchiver) : compte de nouveau dans la limite de l'offre.
export async function restoreContact(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const { supabase, locale, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  if (!id) return { formError: "unknown" };
  const { error } = await supabase.from("contacts").update({ archived_at: null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { formError: dbErrorKey(error) };
  return redirect({ href: `/contacts/${id}`, locale });
}

// Import depuis le carnet du téléphone (Contact Picker API) : un par un, pour que la
// limite de l'offre Découverte arrête l'import au bon endroit. Un contact déjà présent
// (même numéro ou même e-mail qu'un contact actif) n'est pas recréé.
export type ImportResult = { imported: number; skipped: number; duplicates: number; error?: string };

const IN_CHUNK = 50;

export async function importContacts(locale: string, picked: unknown): Promise<ImportResult> {
  const formData = new FormData();
  formData.set("locale", locale);
  formData.set("back", "/contacts");
  const { supabase, workspaceId } = await context(formData);
  const list = pickedSchema.safeParse(picked);
  if (!list.success) return { imported: 0, skipped: 0, duplicates: 0, error: "unknown" };

  const candidates = list.data.map(toContact);
  const valid = candidates.filter((c) => c !== null);
  const known = await existingKeys(
    supabase,
    workspaceId,
    valid.flatMap((c) => (c.phone ? [c.phone] : [])),
    valid.flatMap((c) => (c.email ? [c.email] : [])),
  );

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  for (const candidate of candidates) {
    if (!candidate) {
      skipped += 1;
      continue;
    }
    // Déjà présent dans le workspace, ou plus haut dans la sélection.
    if ((candidate.phone && known.has(candidate.phone)) || (candidate.email && known.has(candidate.email))) {
      duplicates += 1;
      continue;
    }
    const { error } = await supabase.from("contacts").insert({ ...candidate, workspace_id: workspaceId });
    if (error) {
      refresh();
      return { imported, skipped, duplicates, error: dbErrorKey(error) };
    }
    if (candidate.phone) known.add(candidate.phone);
    if (candidate.email) known.add(candidate.email);
    imported += 1;
  }
  refresh();
  return { imported, skipped, duplicates };
}

// Numéros et e-mails (normalisés) déjà portés par un contact actif du workspace.
async function existingKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  phones: string[],
  emails: string[],
): Promise<Set<string>> {
  const known = new Set<string>();
  const lookups = [
    { column: "phone" as const, values: [...new Set(phones)] },
    { column: "email" as const, values: [...new Set(emails)] },
  ];
  for (const { column, values } of lookups) {
    for (let i = 0; i < values.length; i += IN_CHUNK) {
      const { data, error } = await supabase
        .from("contacts")
        .select("phone, email")
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .in(column, values.slice(i, i + IN_CHUNK));
      if (error) throw error;
      data.forEach((row) => {
        const value = row[column];
        if (value) known.add(value);
      });
    }
  }
  return known;
}

// ---------------------------------------------------------------------------
// Opportunités
// ---------------------------------------------------------------------------

export async function saveDeal(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const { supabase, locale, workspaceId } = await context(formData);
  const parsed = parseWith(dealSchema, formValues(formData, DEAL_FIELDS));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };
  const { stage_id: stageId, ...fields } = parsed.data;

  const id = readId(formData, "id");
  if (id) {
    // Modification : l'étape ne change que depuis l'opportunité (gagné et perdu confirmés),
    // le contact ne change pas (ses échanges et rappels lui restent liés). Opportunité ou
    // contact archivés : non modifiable (désarchiver d'abord).
    if (!(await activeDeal(supabase, workspaceId, id))) return { formError: "unknown" };
    const { title, amount, currency, expected_close_on } = fields;
    const { error } = await supabase
      .from("deals")
      .update({ title, amount, currency, expected_close_on })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .select("id")
      .single();
    if (error) return { formError: dbErrorKey(error) };
    return redirect({ href: `/pipeline/${id}`, locale });
  }

  // Création : contact actif seulement (un contact archivé n'apparaît plus au pipeline).
  if (!(await isActiveContact(supabase, workspaceId, fields.contact_id))) {
    return { fieldErrors: { contact_id: "invalid_choice" }, formError: "fix_errors" };
  }
  // Une étape ouverte seulement (la première si aucune n'est choisie).
  const { data: stages, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id, position")
    .eq("workspace_id", workspaceId)
    .eq("kind", "open")
    .order("position");
  if (stageError) return { formError: dbErrorKey(stageError) };
  const stage = stageId ? stages.find((s) => s.id === stageId) : stages[0];
  if (!stage) return { fieldErrors: { stage_id: "invalid_choice" }, formError: "fix_errors" };

  const { data, error } = await supabase
    .from("deals")
    .insert({ ...fields, stage_id: stage.id, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) return { formError: dbErrorKey(error) };
  return redirect({ href: `/pipeline/${data.id}`, locale });
}

// « Étape suivante » ou choix d'une étape (la confirmation de gagné / perdu est demandée
// dans l'interface avant l'envoi).
export async function moveDeal(formData: FormData) {
  const { supabase, locale, back, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  const stageId = readId(formData, "stage_id");
  if (!id || !stageId) return;
  // Opportunité ou contact archivés : étape figée.
  if (!(await activeDeal(supabase, workspaceId, id))) return;
  const { error } = await supabase
    .from("deals")
    .update({ stage_id: stageId })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (error) throw error;
  await settle(locale, back);
}

export async function archiveDeal(formData: FormData) {
  const { supabase, locale, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  if (!id) return;
  const { error } = await supabase
    .from("deals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null);
  if (error) throw error;
  redirect({ href: `/pipeline?archive=${id}`, locale });
}

export async function restoreDeal(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const { supabase, locale, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  if (!id) return { formError: "unknown" };
  const { error } = await supabase.from("deals").update({ archived_at: null }).eq("id", id).eq("workspace_id", workspaceId);
  if (error) return { formError: dbErrorKey(error) };
  return redirect({ href: `/pipeline/${id}`, locale });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Archivé = lecture seule : ces lectures refusent un contact archivé, ou une opportunité
// archivée ou dont le contact l'est.
async function isActiveContact(supabase: Supabase, workspaceId: string, contactId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function activeDeal(supabase: Supabase, workspaceId: string, dealId: string): Promise<{ contact_id: string } | null> {
  const { data, error } = await supabase
    .from("deals")
    .select("contact_id, contacts!inner(id)")
    .eq("id", dealId)
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .is("contacts.archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? { contact_id: data.contact_id } : null;
}

// Contact et opportunité d'un échange ou d'un rappel : l'opportunité donne son contact.
// null si l'un des deux est archivé (plus d'échange ni de rappel tant qu'il l'est).
async function linkedTo(
  supabase: Supabase,
  workspaceId: string,
  formData: FormData,
): Promise<{ contact_id: string; deal_id: string | null } | null> {
  const dealId = readId(formData, "deal_id");
  if (dealId) {
    const deal = await activeDeal(supabase, workspaceId, dealId);
    return deal ? { contact_id: deal.contact_id, deal_id: dealId } : null;
  }
  const contactId = readId(formData, "contact_id");
  if (!contactId || !(await isActiveContact(supabase, workspaceId, contactId))) return null;
  return { contact_id: contactId, deal_id: null };
}

// Rappel non fait, dont le contact et l'opportunité ne sont pas archivés (champ calculé
// about_active) : seul un tel rappel se fait ou se repousse.
async function pendingReminder(supabase: Supabase, workspaceId: string, id: string) {
  const { data, error } = await supabase
    .from("reminders")
    .select("due_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("done_at", null)
    .is("about_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

export async function addActivity(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const { supabase, workspaceId } = await context(formData);
  const parsed = parseWith(activitySchema, formValues(formData, ACTIVITY_FIELDS));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };
  const about = await linkedTo(supabase, workspaceId, formData);
  if (!about) return { formError: "unknown" };

  const { error } = await supabase.from("activities").insert({
    workspace_id: workspaceId,
    ...about,
    kind: parsed.data.kind,
    body: parsed.data.body,
    occurred_at: parsed.data.occurred_at.toISOString(),
  });
  if (error) return { formError: dbErrorKey(error) };
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Rappels
// ---------------------------------------------------------------------------

const quickSchema = z.enum(Object.keys(QUICK_CHOICES) as [keyof typeof QUICK_CHOICES]);

// when : choix rapide (demain, dans 3 jours, dans 1 semaine, à 9 h heure de Madagascar)
// ou « custom » avec la date et l'heure saisies.
export async function createReminder(_prev: CrmFormState, formData: FormData): Promise<CrmFormState> {
  const { supabase, workspaceId } = await context(formData);
  const quick = quickSchema.safeParse(formData.get("when"));
  // Objet facultatif : à défaut, « Relancer <nom> » préparé par la page.
  const title = String(formData.get("title") ?? "").trim() || String(formData.get("default_title") ?? "");
  const quickDate = quick.success ? toLocalInputValue(quickDueAt(quick.data, new Date())) : null;
  const parsed = parseWith(reminderSchema, { title, due_at: quickDate ?? String(formData.get("due_at") ?? "") });
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, formError: "fix_errors" };
  const about = await linkedTo(supabase, workspaceId, formData);
  if (!about) return { formError: "unknown" };

  const { error } = await supabase.from("reminders").insert({
    workspace_id: workspaceId,
    ...about,
    title: parsed.data.title,
    due_at: parsed.data.due_at.toISOString(),
  });
  if (error) return { formError: dbErrorKey(error) };
  refresh();
  return { status: "saved", savedAt: Date.now() };
}

export async function completeReminder(formData: FormData) {
  const { supabase, locale, back, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  if (!id || !(await pendingReminder(supabase, workspaceId, id))) return;
  const { error } = await supabase
    .from("reminders")
    .update({ done_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("done_at", null);
  if (error) throw error;
  await settle(locale, back);
}

const snoozeSchema = z.coerce.number().refine((n): n is SnoozeDays => (SNOOZE_DAYS as readonly number[]).includes(n));

// Repoussé : de nouveau à notifier le jour venu (notified_at remis à zéro).
export async function snoozeReminder(formData: FormData) {
  const { supabase, locale, back, workspaceId } = await context(formData);
  const id = readId(formData, "id");
  const days = snoozeSchema.safeParse(formData.get("days"));
  if (!id || !days.success) return;
  const reminder = await pendingReminder(supabase, workspaceId, id);
  if (!reminder) return;
  const dueAt = snoozeDueAt(new Date(reminder.due_at), days.data as SnoozeDays, new Date());
  const { error } = await supabase
    .from("reminders")
    .update({ due_at: dueAt.toISOString(), notified_at: null })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("done_at", null);
  if (error) throw error;
  await settle(locale, back);
}
