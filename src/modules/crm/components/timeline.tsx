import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { Activity } from "../queries";

// Historique, du plus récent au plus ancien. total : nombre d'échanges en tout (seuls
// les plus récents sont chargés ; la différence est signalée).
export async function Timeline({
  activities,
  total,
  locale,
  empty,
  showDeal = false,
}: {
  activities: Activity[];
  total: number;
  locale: Locale;
  empty: string;
  showDeal?: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations({ locale, namespace: "Activities" }), getFormatter({ locale })]);
  if (activities.length === 0) return <p className="text-base text-ink-muted">{empty}</p>;

  return (
    <>
      <ol className="flex flex-col" data-testid="timeline">
        {activities.map((activity) => (
          <li key={activity.id} className="relative flex gap-3 pb-4 last:pb-0">
            <span className="relative flex flex-col items-center" aria-hidden="true">
              <span className="mt-1.5 size-3 shrink-0 rounded-full bg-turquoise" />
              <span className="w-px flex-1 bg-sand" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-lagoon">{t(`kinds.${activity.kind}`)}</span>
                <time dateTime={activity.occurred_at} className="text-ink-muted">
                  {format.dateTime(new Date(activity.occurred_at), { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </time>
              </p>
              {activity.body && <p className="text-base break-words whitespace-pre-line text-ink">{activity.body}</p>}
              {showDeal && activity.deal_id && activity.deals && (
                <Link href={`/pipeline/${activity.deal_id}`} className="self-start text-sm font-semibold text-lagoon underline-offset-4 hover:underline">
                  {t("deal", { title: activity.deals.title })}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      {total > activities.length && (
        <p className="text-sm text-ink-muted">{t("truncated", { shown: activities.length, total })}</p>
      )}
    </>
  );
}
