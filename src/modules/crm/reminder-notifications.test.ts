import { describe, expect, it, vi } from "vitest";
import {
  buildDigests,
  notifyDueReminders,
  renderDigest,
  type Digest,
  type DueReminder,
  type Recipient,
  type ReminderStore,
} from "./reminder-notifications";
import type { SendResult } from "@/lib/email";

const now = new Date("2026-10-15T05:00:00Z"); // 8 h à Antananarivo

type Row = DueReminder & {
  done_at: string | null;
  notified_at: string | null;
  claimed: boolean;
  attempts: number;
  archived?: boolean;
};

function reminder(id: string, due_at: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    workspace_id: "ws1",
    title: `Relancer ${id}`,
    due_at,
    contact_name: "Rakoto",
    deal_title: null,
    claimed_at: "",
    done_at: null,
    notified_at: null,
    claimed: false,
    attempts: 0,
    ...extra,
  };
}

// Base en mémoire qui applique les mêmes règles que les fonctions SQL
// (claim_due_reminders, mark_reminders_notified, release_reminders), testées par pgTAP.
// mark et release ne touchent que les rappels encore réservés par ce passage
// (même claimed_at).
function memoryStore(rows: Row[], recipients: Recipient[]) {
  const calls = { claim: 0 };
  const stillClaimed = (r: Row, mine: DueReminder[]) =>
    r.claimed && !r.notified_at && mine.some((m) => m.id === r.id && m.claimed_at === r.claimed_at);
  const store: ReminderStore = {
    async claim(cutoff, limit) {
      calls.claim += 1;
      const taken = rows
        .filter((r) => !r.done_at && !r.notified_at && !r.claimed && r.attempts < 3 && !r.archived && new Date(r.due_at) < cutoff)
        .sort((a, b) => a.due_at.localeCompare(b.due_at))
        .slice(0, limit);
      const claimedAt = `claim-${calls.claim}`;
      taken.forEach((r) => {
        r.claimed = true;
        r.claimed_at = claimedAt;
      });
      return taken.map(({ id, workspace_id, title, due_at, contact_name, deal_title, claimed_at }) => ({
        id,
        workspace_id,
        title,
        due_at,
        contact_name,
        deal_title,
        claimed_at,
      }));
    },
    async markNotified(mine) {
      rows.filter((r) => stillClaimed(r, mine)).forEach((r) => {
        r.notified_at = now.toISOString();
        r.claimed = false;
      });
    },
    async release(mine, failed) {
      const abandoned: string[] = [];
      rows.filter((r) => stillClaimed(r, mine)).forEach((r) => {
        r.claimed = false;
        if (failed) r.attempts += 1;
        if (failed && r.attempts >= 3) abandoned.push(r.id);
      });
      return abandoned;
    },
    async recipients(ids) {
      return recipients.filter((r) => ids.includes(r.workspace_id));
    },
  };
  return { store, rows, calls };
}

const hery: Recipient = { workspace_id: "ws1", email: "hery@example.mg", locale: "fr" };
const sent = () => vi.fn<(digest: Digest) => Promise<SendResult>>(async () => "sent");

describe("sélection des rappels du jour", () => {
  it("échéance aujourd'hui (heure de Madagascar) ou en retard, non faits, pas encore notifiés, non archivés", async () => {
    const { store } = memoryStore(
      [
        reminder("retard", "2026-10-12T06:00:00Z"),
        reminder("ce-matin", "2026-10-15T06:00:00Z"),
        reminder("ce-soir", "2026-10-15T20:30:00Z"), // 23 h 30 local : aujourd'hui
        reminder("demain", "2026-10-15T21:00:00Z"), // minuit local : demain
        reminder("fait", "2026-10-15T06:00:00Z", { done_at: "2026-10-15T04:00:00Z" }),
        reminder("deja", "2026-10-14T06:00:00Z", { notified_at: "2026-10-14T05:00:00Z" }),
        reminder("archive", "2026-10-14T06:00:00Z", { archived: true }),
      ],
      [hery],
    );
    const send = sent();
    const result = await notifyDueReminders({ store, send, now });

    expect(result).toEqual({ claimed: 3, sent: 1, skipped: 0, failed: 0, deferred: 0, abandoned: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const digest = send.mock.calls[0][0];
    expect(digest.to).toBe("hery@example.mg");
    expect(digest.reminders.map((r) => r.id)).toEqual(["retard", "ce-matin", "ce-soir"]);
  });

  it("idempotent : un second passage n'envoie rien", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    const send = sent();
    await notifyDueReminders({ store, send, now });
    const again = await notifyDueReminders({ store, send, now });
    expect(again).toEqual({ claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0, abandoned: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(rows[0].notified_at).toBe(now.toISOString());
    expect(rows[0].claimed).toBe(false);
  });

  it("deux passages simultanés : un seul envoi", async () => {
    const { store } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    const send = sent();
    await Promise.all([notifyDueReminders({ store, send, now }), notifyDueReminders({ store, send, now })]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("beaucoup de rappels : réservés par lots, un seul e-mail par personne", async () => {
    const rows = Array.from({ length: 450 }, (_, i) =>
      reminder(`r${String(i).padStart(3, "0")}`, new Date(Date.parse("2026-10-14T06:00:00Z") + i * 60_000).toISOString()),
    );
    const { store, calls } = memoryStore(rows, [hery]);
    const send = sent();
    const result = await notifyDueReminders({ store, send, now, batch: 200 });
    expect(calls.claim).toBe(3);
    expect(result).toMatchObject({ claimed: 450, sent: 1 });
    expect(send.mock.calls[0][0].reminders).toHaveLength(450);
    expect(rows.every((r) => r.notified_at)).toBe(true);
  });

  it("rappel repoussé pendant l'envoi : pas marqué notifié, de nouveau à notifier", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    const send = vi.fn<(digest: Digest) => Promise<SendResult>>(async () => {
      // reminders_reschedule : nouvelle échéance, bail levé.
      Object.assign(rows[0], { due_at: "2026-10-18T06:00:00Z", claimed: false, claimed_at: "" });
      return "sent";
    });
    await notifyDueReminders({ store, send, now });
    expect(rows[0]).toMatchObject({ notified_at: null, claimed: false, attempts: 0 });
  });

  it("notified_at posé seulement après un envoi réussi", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    const send = vi.fn<(digest: Digest) => Promise<SendResult>>(async () => {
      expect(rows[0].notified_at).toBeNull();
      expect(rows[0].claimed).toBe(true);
      return "sent";
    });
    await notifyDueReminders({ store, send, now });
    expect(rows[0].notified_at).not.toBeNull();
  });

  it("envoi échoué ou désactivé (pas de clé Resend) : rappels rendus pour le prochain passage", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    const failed = await notifyDueReminders({ store, send: async () => "failed", now });
    expect(failed.failed).toBe(1);
    expect(rows[0]).toMatchObject({ notified_at: null, claimed: false, attempts: 1 });

    const skipped = await notifyDueReminders({ store, send: async () => "skipped", now });
    expect(skipped.skipped).toBe(1);
    expect(rows[0]).toMatchObject({ notified_at: null, claimed: false, attempts: 1 });

    const thrown = await notifyDueReminders({ store, send: async () => Promise.reject(new Error("réseau")), now });
    expect(thrown.failed).toBe(1);
    expect(rows[0]).toMatchObject({ notified_at: null, claimed: false, attempts: 2 });
  });

  it("après 3 échecs, le rappel ne bloque plus la file et il est signalé", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await notifyDueReminders({ store, send: async () => "failed", now }));
    expect(results.map((r) => r.abandoned)).toEqual([0, 0, 1]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("a");
    log.mockRestore();
    const send = sent();
    const result = await notifyDueReminders({ store, send, now });
    expect(rows[0].attempts).toBe(3);
    expect(result.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("personne à prévenir : rien n'est marqué notifié, un essai compté", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z", { workspace_id: "orphelin" })], [hery]);
    const send = sent();
    await notifyDueReminders({ store, send, now });
    expect(send).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ notified_at: null, claimed: false, attempts: 1 });
  });

  it("temps écoulé : les e-mails restants sont rendus sans compter d'essai", async () => {
    const soa: Recipient = { workspace_id: "ws2", email: "soa@example.mg", locale: "fr" };
    const { store, rows } = memoryStore(
      [reminder("a", "2026-10-15T05:00:00Z"), reminder("b", "2026-10-15T06:00:00Z", { workspace_id: "ws2" })],
      [hery, soa],
    );
    let t = 0;
    const send = vi.fn<(digest: Digest) => Promise<SendResult>>(async () => {
      t += 1000; // chaque envoi prend 1 s ; budget : 1 s
      return "sent";
    });
    const result = await notifyDueReminders({ store, send, now, clock: () => t, budgetMs: 1000 });
    expect(result).toMatchObject({ claimed: 2, sent: 1, deferred: 1 });
    expect(rows.find((r) => r.id === "b")).toMatchObject({ notified_at: null, claimed: false, attempts: 0 });
  });

  it("erreur en cours de passage : les rappels réservés sont rendus", async () => {
    const { store, rows } = memoryStore([reminder("a", "2026-10-15T06:00:00Z")], [hery]);
    store.recipients = async () => {
      throw new Error("base");
    };
    await expect(notifyDueReminders({ store, send: sent(), now })).rejects.toThrow("base");
    expect(rows[0]).toMatchObject({ notified_at: null, claimed: false, attempts: 0 });
  });
});

describe("récapitulatifs", () => {
  it("un e-mail par personne, chacun avec les rappels de ses workspaces", () => {
    const rows = [reminder("a", "2026-10-15T08:00:00Z"), reminder("b", "2026-10-15T06:00:00Z"), reminder("c", "2026-10-15T06:00:00Z", { workspace_id: "ws2" })];
    const digests = buildDigests(rows, [hery, { workspace_id: "ws2", email: "soa@example.mg", locale: "en" }]);
    expect(digests.map((d) => [d.to, d.locale, d.reminders.map((r) => r.id)])).toEqual([
      ["hery@example.mg", "fr", ["b", "a"]],
      ["soa@example.mg", "en", ["c"]],
    ]);
  });

  it("contenu traduit, échappé, avec l'heure de Madagascar", () => {
    const mail = renderDigest(
      {
        to: "hery@example.mg",
        locale: "fr",
        reminders: [
          reminder("<b>x</b>", "2026-10-12T06:00:00Z", { title: "Relancer <Rabe>" }),
          reminder("b", "2026-10-15T06:00:00Z", { deal_title: "Logo" }),
        ],
      },
      "https://app.ivonea.com/",
      now,
    );
    expect(mail.subject).toBe("Tes rappels du jour (2)");
    expect(mail.text).toContain("Relancer <Rabe> (Rakoto) : en retard depuis le 12 oct.");
    expect(mail.text).toContain("(Rakoto · Logo) : aujourd'hui à 09:00");
    expect(mail.text).toContain("https://app.ivonea.com/fr/tableau-de-bord");
    expect(mail.html).toContain("Relancer &lt;Rabe&gt;");
    expect(mail.html).not.toContain("<Rabe>");
  });
});
