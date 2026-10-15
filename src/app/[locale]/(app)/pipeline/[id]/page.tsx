import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRightIcon, BellIcon, ChatIcon, PhoneIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatMoney, type Currency } from "@/lib/money";
import { toLocalInputValue } from "@/lib/time";
import { archiveDeal } from "@/modules/crm/actions";
import { ActivityForm } from "@/modules/crm/components/activity-form";
import { ReminderForm } from "@/modules/crm/components/reminder-form";
import { ReminderList } from "@/modules/crm/components/reminder-list";
import { StageButton } from "@/modules/crm/components/stage-button";
import { Timeline } from "@/modules/crm/components/timeline";
import { UndoBanner } from "@/modules/crm/components/undo-banner";
import { telHref, whatsappHref } from "@/modules/crm/phone";
import { getContact, getDeal, listActivities, listPendingReminders, listStages } from "@/modules/crm/queries";
import { stageLabel } from "@/modules/crm/stage-label";
import { nextStage } from "@/modules/crm/stages";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/pipeline/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Deals" });
  return { title: t("metaDetail") };
}

// Opportunité : montant, contact, étape (« Étape suivante » en bas, ou choix d'une étape),
// rappels et historique.
export default async function DealPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const deal = await getDeal(workspace.id, id);
  if (!deal) notFound();

  const [contact, stages, { activities, total: activityTotal }, reminders, t, tAll, format] = await Promise.all([
    getContact(workspace.id, deal.contact_id),
    listStages(workspace.id),
    listActivities(workspace.id, { dealId: deal.id }),
    listPendingReminders(workspace.id, { dealId: deal.id }),
    getTranslations({ locale, namespace: "Deals" }),
    getTranslations({ locale }),
    getFormatter({ locale }),
  ]);
  const now = new Date();
  const back = `/pipeline/${deal.id}`;
  const current = stages.find((s) => s.id === deal.stage_id);
  const next = nextStage(stages, deal.stage_id);
  const label = (name: string) => stageLabel(tAll, name);
  // Opportunité ou contact archivés : consultation seule (étape, rappels et échanges figés).
  const contactArchived = Boolean(contact?.archived_at);
  const active = !deal.archived_at && !contactArchived;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/pipeline" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToPipeline")}
      </Link>

      {deal.archived_at && (
        <UndoBanner kind="deal" id={deal.id} message={t("archived", { title: deal.title })} undoLabel={tAll("Contacts.restore")} back={back} />
      )}

      {contact && contactArchived && !deal.archived_at && (
        <div role="status" className="flex flex-col items-start gap-1 rounded-xl bg-lagoon px-4 py-3 text-sm text-white on-dark">
          <span className="font-medium">{t("contactArchived", { name: contact.name })}</span>
          <Link href={`/contacts/${contact.id}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
            {t("openContact")}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {current && (
          <Badge tone={current.kind === "won" ? "success" : current.kind === "lost" ? "danger" : "accent"} className="self-start" data-testid="deal-stage">
            {t("currentStage", { stage: label(current.name) })}
          </Badge>
        )}
        <h1 className="text-2xl font-bold break-words text-lagoon">{deal.title}</h1>
        <p className="text-xl font-bold text-ink">
          {deal.amount !== null ? formatMoney(deal.amount, deal.currency as Currency, locale) : t("noAmount")}
        </p>
        {deal.expected_close_on && (
          <p className="text-sm text-ink-muted">
            {t("expectedClose", {
              date: format.dateTime(new Date(`${deal.expected_close_on}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" }),
            })}
          </p>
        )}
      </div>

      {contact && (
        <div className="flex items-center gap-2">
          <Link
            href={`/contacts/${contact.id}`}
            className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-xl border border-sand/70 bg-white px-3 hover:border-lagoon"
          >
            <span className="text-xs text-ink-muted">{t("contact.label")}</span>
            <span className="truncate text-base font-semibold text-lagoon">{contact.name}</span>
          </Link>
          {contact.phone && (
            <>
              <a href={telHref(contact.phone)} aria-label={tAll("Contacts.call")} className={buttonClasses("secondary", false, "min-h-12 px-3")}>
                <PhoneIcon className="size-5" />
              </a>
              <a
                href={whatsappHref(contact.phone)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tAll("Contacts.whatsapp")}
                className={buttonClasses("secondary", false, "min-h-12 px-3")}
              >
                <ChatIcon className="size-5" />
              </a>
            </>
          )}
        </div>
      )}

      {active && (
        <>
        <section aria-labelledby="stage-title" className="flex flex-col gap-3">
          <h2 id="stage-title" className="text-lg font-bold text-lagoon">
            {t("chooseStage")}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {stages.map((stage) => {
              const isCurrent = stage.id === deal.stage_id;
              return (
                <li key={stage.id} className="flex">
                  {isCurrent ? (
                    <span
                      aria-current="step"
                      className="flex min-h-11 flex-1 items-center justify-center rounded-xl border-2 border-lagoon bg-lagoon px-3 text-base font-semibold text-white"
                    >
                      {label(stage.name)}
                    </span>
                  ) : (
                    <StageButton
                      dealId={deal.id}
                      stage={{ id: stage.id, kind: stage.kind, label: label(stage.name) }}
                      back={back}
                      label={t("moveTo", { stage: label(stage.name) })}
                      className="flex-1 px-3"
                    >
                      {label(stage.name)}
                    </StageButton>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <Card aria-labelledby="reminders-title" className="flex flex-col gap-4">
          <h2 id="reminders-title" className="flex items-center gap-2 text-lg font-bold text-lagoon">
            <BellIcon className="size-5 text-turquoise" />
            {tAll("Reminders.remindMe")}
          </h2>
          {reminders.length > 0 && <ReminderList reminders={reminders} locale={locale} back={back} now={now} />}
          <ReminderForm
            about={{ dealId: deal.id }}
            back={back}
            defaultTitle={tAll("Reminders.defaultTitle", { name: contact?.name ?? deal.title })}
            minDate={toLocalInputValue(now)}
          />
        </Card>

        <Card aria-labelledby="activity-title" className="flex flex-col gap-4">
          <h2 id="activity-title" className="text-lg font-bold text-lagoon">
            {tAll("Activities.title")}
          </h2>
          <ActivityForm about={{ dealId: deal.id }} back={back} now={toLocalInputValue(now)} />
        </Card>
        </>
      )}

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg font-bold text-lagoon">
          {t("history.title")}
        </h2>
        <Timeline activities={activities} total={activityTotal} locale={locale} empty={t("history.empty")} />
      </section>

      <div className="flex flex-col gap-3 border-t border-sand pt-4">
        {active && (
          <Link href={`/pipeline/${deal.id}/modifier`} className={buttonClasses("secondary", true)}>
            {t("edit")}
          </Link>
        )}
        {!deal.archived_at && (
          <form action={archiveDeal}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={deal.id} />
            <SubmitButton variant="danger" block>
              {t("archive")}
            </SubmitButton>
          </form>
        )}
      </div>

      {next && active && (
        <BottomBar>
          <StageButton
            dealId={deal.id}
            stage={{ id: next.id, kind: next.kind, label: label(next.name) }}
            back={back}
            variant="primary"
            className="w-full"
          >
            {t("nextStage", { stage: label(next.name) })}
            <ArrowRightIcon className="size-5" />
          </StageButton>
        </BottomBar>
      )}
    </div>
  );
}
