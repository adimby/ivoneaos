import { getTranslations } from "next-intl/server";
import { BellIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { listTodayReminders } from "../queries";
import { ReminderList } from "./reminder-list";

// Bloc « Aujourd'hui » du tableau de bord : rappels du jour et en retard, non faits.
export async function TodayReminders({ workspaceId, locale }: { workspaceId: string; locale: Locale }) {
  const now = new Date();
  const [{ reminders, total }, t] = await Promise.all([
    listTodayReminders(workspaceId, now),
    getTranslations({ locale, namespace: "Today" }),
  ]);

  return (
    <Card aria-labelledby="today-title" className="flex flex-col gap-3" data-testid="today">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-title" className="flex items-center gap-2 text-lg font-bold text-lagoon">
          <BellIcon className="size-5 text-turquoise" />
          {t("title")}
        </h2>
        {total > 0 && <span className="text-sm font-semibold text-ink-muted">{t("count", { count: total })}</span>}
      </div>
      {reminders.length === 0 ? (
        <div className="flex flex-col items-start gap-1">
          <p className="text-base text-ink-muted">{t("empty")}</p>
          <Link href="/contacts" className="inline-flex min-h-11 items-center text-base font-semibold text-lagoon underline-offset-4 hover:underline">
            {t("contactsLink")}
          </Link>
        </div>
      ) : (
        <>
          <ReminderList reminders={reminders} locale={locale} back="/tableau-de-bord" showAbout now={now} />
          {total > reminders.length && (
            <p className="text-sm text-ink-muted">{t("truncated", { shown: reminders.length, total })}</p>
          )}
        </>
      )}
    </Card>
  );
}
