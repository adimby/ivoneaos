import { getFormatter, getTranslations } from "next-intl/server";
import { CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localDayDiff } from "@/lib/time";
import { completeReminder, snoozeReminder } from "../actions";
import type { Reminder } from "../queries";
import { SNOOZE_DAYS } from "../reminder-dates";

// Rappels non faits : « Fait » et « Repousser » (+1 jour, +3 jours, +1 semaine) en un
// geste. Formulaires d'action serveur : utilisables avant même le chargement du JavaScript.
export async function ReminderList({
  reminders,
  locale,
  back,
  showAbout = false,
  now,
}: {
  reminders: Reminder[];
  locale: Locale;
  back: string;
  showAbout?: boolean;
  now: Date;
}) {
  const [t, format] = await Promise.all([getTranslations({ locale, namespace: "Reminders" }), getFormatter({ locale })]);

  return (
    <ul className="flex flex-col gap-3">
      {reminders.map((reminder) => {
        const due = new Date(reminder.due_at);
        const diff = localDayDiff(due, now);
        const time = format.dateTime(due, { hour: "2-digit", minute: "2-digit" });
        const date = format.dateTime(due, { weekday: "short", day: "numeric", month: "short" });
        const when =
          diff === 0
            ? t("when.today", { time })
            : diff === 1
              ? t("when.tomorrow", { time })
              : t(diff < 0 ? "when.past" : "when.future", { date, time });
        const overdue = due < now;
        const about = reminder.deals?.title ?? reminder.contacts?.name;
        const href = reminder.deal_id ? `/pipeline/${reminder.deal_id}` : reminder.contact_id ? `/contacts/${reminder.contact_id}` : null;

        return (
          <li key={reminder.id} data-testid="reminder" className="flex flex-col gap-3 rounded-xl border border-sand/70 bg-white p-3">
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-ink">{reminder.title}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                {overdue && <Badge tone="danger">{t("overdue")}</Badge>}
                <span>{when}</span>
                {showAbout && about && href && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Link href={href} className="font-semibold text-lagoon underline-offset-4 hover:underline">
                      {about}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={completeReminder}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={reminder.id} />
                <SubmitButton className="min-h-11 px-3 text-sm" aria-label={t("markDoneLabel", { title: reminder.title })}>
                  <CheckIcon className="size-4" />
                  {t("markDone")}
                </SubmitButton>
              </form>
              <form action={snoozeReminder} role="group" aria-label={t("snoozeLabel", { title: reminder.title })} className="flex min-w-[12rem] flex-1 gap-2">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="id" value={reminder.id} />
                {SNOOZE_DAYS.map((days) => (
                  // Désactivés pendant l'envoi : un second appui ne repousse pas deux fois.
                  <SubmitButton
                    key={days}
                    name="days"
                    value={days}
                    variant="secondary"
                    aria-label={t(`snooze.${days}`)}
                    className="min-h-11 flex-1 gap-1 px-1 text-sm whitespace-nowrap"
                  >
                    {t(`snoozeShort.${days}`)}
                  </SubmitButton>
                ))}
              </form>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
