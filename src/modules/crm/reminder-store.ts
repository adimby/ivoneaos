import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import type { DueReminder, Recipient, ReminderStore } from "./reminder-notifications";

// Filtres « in » envoyés dans l'URL : par paquets, pour rester loin de sa taille maximale.
const IN_CHUNK = 50;

// Rappels regroupés par horodatage de réservation (un par appel à claim).
function byClaim(reminders: DueReminder[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const r of reminders) groups.set(r.claimed_at, [...(groups.get(r.claimed_at) ?? []), r.id]);
  return [...groups];
}

function chunks<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Accès base du cron des rappels, avec le client secret (tous les workspaces).
// Réservation, envoi réussi et reprise passent par des fonctions SQL (identifiants dans
// le corps de la requête) : supabase/migrations/20261015090000_crm_reminders_and_search.sql.
export function reminderStore(admin: AdminClient): ReminderStore {
  return {
    async claim(cutoff, limit) {
      const { data, error } = await admin.rpc("claim_due_reminders", { p_cutoff: cutoff.toISOString(), p_limit: limit });
      if (error) throw error;
      return data.map(
        (r): DueReminder => ({
          id: r.id,
          workspace_id: r.workspace_id,
          title: r.title,
          due_at: r.due_at,
          contact_name: r.contact_name ?? null,
          deal_title: r.deal_title ?? null,
          claimed_at: r.claimed_at,
        }),
      );
    },

    async markNotified(reminders) {
      for (const [claimedAt, ids] of byClaim(reminders)) {
        const { error } = await admin.rpc("mark_reminders_notified", { p_ids: ids, p_claimed_at: claimedAt });
        if (error) throw error;
      }
    },

    async release(reminders, failed) {
      const abandoned: string[] = [];
      for (const [claimedAt, ids] of byClaim(reminders)) {
        const { data, error } = await admin.rpc("release_reminders", { p_ids: ids, p_claimed_at: claimedAt, p_failed: failed });
        if (error) throw error;
        abandoned.push(...data);
      }
      return abandoned;
    },

    async recipients(workspaceIds) {
      const members: { workspace_id: string; user_id: string }[] = [];
      for (const ids of chunks(workspaceIds)) {
        const { data, error } = await admin.from("workspace_members").select("workspace_id, user_id").in("workspace_id", ids);
        if (error) throw error;
        members.push(...data);
      }
      const userIds = [...new Set(members.map((m) => m.user_id))];
      const locales = new Map<string, string>();
      for (const ids of chunks(userIds)) {
        const { data, error } = await admin.from("profiles").select("user_id, locale").in("user_id", ids);
        if (error) throw error;
        data.forEach((p) => locales.set(p.user_id, p.locale));
      }

      const emails = new Map<string, string>();
      for (const id of userIds) {
        const { data } = await admin.auth.admin.getUserById(id);
        if (data.user?.email) emails.set(id, data.user.email);
      }
      return members.flatMap((m): Recipient[] => {
        const email = emails.get(m.user_id);
        if (!email) return [];
        return [{ workspace_id: m.workspace_id, email, locale: locales.get(m.user_id) === "en" ? "en" : "fr" }];
      });
    },
  };
}
