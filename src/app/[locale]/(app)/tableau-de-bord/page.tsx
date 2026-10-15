import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { hasQuote } from "@/modules/billing/queries";
import { hasActiveContact } from "@/modules/crm/queries";
import { checklistTextLevel, startChecklist } from "@/modules/onboarding/checklist";
import { isPapiConnected } from "@/modules/payments/queries";
import { requireWorkspace } from "@/modules/workspace/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/tableau-de-bord">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("metaTitle") };
}

const BLOCKS = ["collected", "pending", "deals", "reminders"] as const;

export default async function DashboardPage({ params }: PageProps<"/[locale]/tableau-de-bord">) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const [hasContact, papiConnected, quote, t, tLevels, tCommon] = await Promise.all([
    hasActiveContact(workspace.id),
    isPapiConnected(workspace.id),
    hasQuote(workspace.id),
    getTranslations({ locale, namespace: "Dashboard" }),
    getTranslations({ locale, namespace: "Levels" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  const items = startChecklist(workspace.level, { hasContact, papiConnected, hasQuote: quote });
  const textLevel = checklistTextLevel(workspace.level);
  const doneCount = items.filter((item) => item.done).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-base text-ink-muted">{t("greeting")}</p>
        <h1 className="text-2xl font-bold text-lagoon">{workspace.name}</h1>
        <Badge className="self-start">{t("level", { level: tLevels(`${workspace.level}.name`) })}</Badge>
      </div>

      <Card aria-labelledby="checklist-title" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="checklist-title" className="text-lg font-bold text-lagoon">
            {t("checklist.title")}
          </h2>
          <span className="text-sm font-semibold text-ink-muted">
            {t("checklist.progress", { done: doneCount, total: items.length })}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand/60" aria-hidden="true">
          <div className="h-full rounded-full bg-turquoise" style={{ width: `${(doneCount / items.length) * 100}%` }} />
        </div>
        {doneCount === items.length && <p className="text-sm font-semibold text-success">{t("checklist.allDone")}</p>}
        <ol className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                data-testid={`checklist-${item.key}`}
                data-done={item.done}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-sand/70 bg-white p-3 hover:border-lagoon"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                    item.done ? "border-success bg-success text-white" : "border-sand-strong text-transparent",
                  )}
                  aria-hidden="true"
                >
                  <CheckIcon className="size-4" />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className={cn("text-base font-semibold", item.done && "text-ink-muted line-through")}>
                    {t(`items.${item.key}.${textLevel}.title`)}
                  </span>
                  <span className="text-sm text-ink-muted">{t(`items.${item.key}.${textLevel}.description`)}</span>
                  <span className="sr-only">{item.done ? t("checklist.done") : t("checklist.todo")}</span>
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <section aria-labelledby="blocks-title" className="flex flex-col gap-3">
        <h2 id="blocks-title" className="text-lg font-bold text-lagoon">
          {t("blocks.title")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {BLOCKS.map((block) => (
            <div key={block} className="flex min-h-24 flex-col justify-between gap-2 rounded-card border border-dashed border-sand-strong/50 bg-white/60 p-3">
              <span className="text-sm font-semibold text-ink">{t(`blocks.${block}`)}</span>
              <span className="text-xs text-ink-muted">{tCommon("comingSoon")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
