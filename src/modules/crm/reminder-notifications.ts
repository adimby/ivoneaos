import { createFormatter, createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import type { SendResult } from "@/lib/email";
import { localDayDiff, TIME_ZONE } from "@/lib/time";
import { todayCutoff } from "./reminder-dates";

// Notification des rappels du jour (cron quotidien) : un e-mail récapitulatif par personne.
// Logique pure, testée sans base ni réseau : le stockage et l'envoi sont passés en paramètres.

export type DueReminder = {
  id: string;
  workspace_id: string;
  title: string;
  due_at: string;
  contact_name: string | null;
  deal_title: string | null;
  // Horodatage de réservation (notify_claimed_at), tel que renvoyé par la base : mark et
  // release ne touchent que les rappels encore réservés à cet instant (un rappel repoussé
  // pendant l'envoi, ou repris par un autre passage, n'est pas modifié).
  claimed_at: string;
};
export type Recipient = { workspace_id: string; email: string; locale: "fr" | "en" };
export type Digest = { to: string; locale: "fr" | "en"; reminders: DueReminder[] };

export type ReminderStore = {
  // Réserve (bail de quelques minutes) au plus `limit` rappels non faits, pas encore
  // notifiés ni réservés, échéance avant `cutoff`, contact et opportunité non archivés.
  // Deux exécutions simultanées ne prennent jamais le même rappel ; un passage interrompu
  // laisse un bail qui expire, et les rappels sont repris au passage suivant.
  claim(cutoff: Date, limit: number): Promise<DueReminder[]>;
  // Envoi réussi : notified_at posé, bail levé.
  markNotified(reminders: DueReminder[]): Promise<void>;
  // Non envoyés : bail levé. failed compte un essai (3 au plus, ensuite ignorés pour ne
  // pas bloquer la file) ; un envoi désactivé (pas de clé Resend) ne compte pas.
  // Renvoie les identifiants des rappels qui viennent d'atteindre 3 essais.
  release(reminders: DueReminder[], failed: boolean): Promise<string[]>;
  recipients(workspaceIds: string[]): Promise<Recipient[]>;
};

// Un récapitulatif par adresse, rappels triés par échéance ; chaque membre du workspace
// d'un rappel le reçoit (au MVP : la seule personne du workspace).
export function buildDigests(reminders: DueReminder[], recipients: Recipient[]): Digest[] {
  const byEmail = new Map<string, Digest>();
  for (const recipient of recipients) {
    const mine = reminders.filter((r) => r.workspace_id === recipient.workspace_id);
    if (mine.length === 0) continue;
    const digest = byEmail.get(recipient.email) ?? { to: recipient.email, locale: recipient.locale, reminders: [] };
    digest.reminders.push(...mine.filter((r) => !digest.reminders.some((d) => d.id === r.id)));
    byEmail.set(recipient.email, digest);
  }
  for (const digest of byEmail.values()) digest.reminders.sort((a, b) => a.due_at.localeCompare(b.due_at));
  return [...byEmail.values()];
}

// abandoned : rappels qui atteignent 3 échecs pendant ce passage ; le cron ne les reprend
// plus (ils restent dans « Aujourd'hui ») et leurs identifiants sont journalisés.
export type NotifyResult = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  deferred: number;
  abandoned: number;
};

// Lot réservé en une requête (identifiants dans le corps, jamais dans l'URL).
export const CLAIM_BATCH = 200;
// Rappels traités au plus par passage ; le reste attend le passage suivant.
export const MAX_PER_RUN = 5_000;
// Temps de travail d'un passage : au-delà, plus d'envoi ; le reste est rendu et repris
// au passage suivant.
export const TIME_BUDGET_MS = 45_000;

export async function notifyDueReminders({
  store,
  send,
  now,
  clock = Date.now,
  budgetMs = TIME_BUDGET_MS,
  batch = CLAIM_BATCH,
  maxPerRun = MAX_PER_RUN,
}: {
  store: ReminderStore;
  send: (digest: Digest) => Promise<SendResult>;
  now: Date;
  clock?: () => number;
  budgetMs?: number;
  batch?: number;
  maxPerRun?: number;
}): Promise<NotifyResult> {
  const result: NotifyResult = { claimed: 0, sent: 0, skipped: 0, failed: 0, deferred: 0, abandoned: 0 };
  const cutoff = todayCutoff(now);
  const deadline = clock() + budgetMs;
  const claimed: DueReminder[] = [];
  const delivered = new Set<string>();
  const failed = new Set<string>();

  try {
    // 1. Réservation par lots (sous bail : un lot suivant ne reprend pas les mêmes).
    while (claimed.length < maxPerRun && clock() < deadline) {
      const lot = await store.claim(cutoff, Math.min(batch, maxPerRun - claimed.length));
      claimed.push(...lot);
      if (lot.length < batch) break;
    }
    result.claimed = claimed.length;
    if (claimed.length === 0) return result;

    // 2. Un e-mail par personne, avec tous ses rappels du passage.
    const recipients = await store.recipients([...new Set(claimed.map((r) => r.workspace_id))]);
    const reachable = new Set(recipients.map((r) => r.workspace_id));
    // Personne à prévenir : compté comme un échec (3 essais au plus).
    claimed.filter((r) => !reachable.has(r.workspace_id)).forEach((r) => failed.add(r.id));

    for (const digest of buildDigests(claimed, recipients)) {
      if (clock() >= deadline) {
        result.deferred += 1;
        continue;
      }
      const status = await send(digest).catch((): SendResult => "failed");
      result[status] += 1;
      const ids = digest.reminders.map((r) => r.id);
      if (status === "sent") {
        await store.markNotified(digest.reminders);
        ids.forEach((id) => delivered.add(id));
      } else if (status === "failed") ids.forEach((id) => failed.add(id));
    }
  } finally {
    // Non envoyés (échec, envoi désactivé, délai dépassé, erreur) : bail levé, repris au
    // prochain passage. Un rappel envoyé à une personne l'est pour tout son workspace.
    const notSent = claimed.filter((r) => !delivered.has(r.id));
    const failedOnes = notSent.filter((r) => failed.has(r.id));
    const others = notSent.filter((r) => !failed.has(r.id));
    if (failedOnes.length > 0) {
      const abandoned = await store.release(failedOnes, true);
      result.abandoned = abandoned.length;
      if (abandoned.length > 0) {
        console.error(`[cron] Rappels abandonnés après 3 échecs d'envoi : ${abandoned.join(", ")}`);
      }
    }
    if (others.length > 0) await store.release(others, false);
  }
  return result;
}

const MESSAGES = { fr, en };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Contenu de l'e-mail (texte et HTML simple), dans la langue de la personne.
export function renderDigest(digest: Digest, appUrl: string, now: Date) {
  const t = createTranslator({ locale: digest.locale, messages: MESSAGES[digest.locale], namespace: "ReminderEmail" });
  const format = createFormatter({ locale: digest.locale, timeZone: TIME_ZONE });
  const link = `${appUrl.replace(/\/$/, "")}/${digest.locale}/tableau-de-bord`;

  const lines = digest.reminders.map((r) => {
    const due = new Date(r.due_at);
    const when =
      localDayDiff(due, now) < 0
        ? t("overdue", { date: format.dateTime(due, { day: "numeric", month: "short" }) })
        : t("today", { time: format.dateTime(due, { hour: "2-digit", minute: "2-digit" }) });
    const about = [r.contact_name, r.deal_title].filter(Boolean).join(" · ");
    return { title: r.title, about, when };
  });

  const subject = t("subject", { count: lines.length });
  const text = [
    t("intro"),
    "",
    ...lines.map((l) => `• ${l.title}${l.about ? ` (${l.about})` : ""} : ${l.when}`),
    "",
    `${t("cta")} : ${link}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;color:#0b2a2e;line-height:1.5">
<p>${escapeHtml(t("intro"))}</p>
<ul style="padding-left:20px">${lines
    .map(
      (l) =>
        `<li style="margin-bottom:8px"><strong>${escapeHtml(l.title)}</strong>${
          l.about ? ` <span style="color:#45605f">(${escapeHtml(l.about)})</span>` : ""
        }<br><span style="color:#45605f">${escapeHtml(l.when)}</span></li>`,
    )
    .join("")}</ul>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#a45c36;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(t("cta"))}</a></p>
<p style="color:#45605f;font-size:13px">${escapeHtml(t("footer"))}</p>
</div>`;
  return { to: digest.to, subject, text, html };
}
