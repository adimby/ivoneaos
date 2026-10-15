import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BellIcon, ChatIcon, MailIcon, PhoneIcon, PlusIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { toLocalInputValue } from "@/lib/time";
import { archiveContact } from "@/modules/crm/actions";
import { ActivityForm } from "@/modules/crm/components/activity-form";
import { DealCard } from "@/modules/crm/components/deal-card";
import { ReminderForm } from "@/modules/crm/components/reminder-form";
import { ReminderList } from "@/modules/crm/components/reminder-list";
import { Timeline } from "@/modules/crm/components/timeline";
import { UndoBanner } from "@/modules/crm/components/undo-banner";
import { formatPhone, telHref, whatsappHref } from "@/modules/crm/phone";
import { getContact, listActivities, listContactDeals, listPendingReminders, listStages } from "@/modules/crm/queries";
import { stageLabel } from "@/modules/crm/stage-label";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/contacts/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contacts" });
  return { title: t("metaTitle") };
}

// Fiche contact : joindre (appel, WhatsApp, e-mail), rappels, opportunités, historique.
export default async function ContactPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const contact = await getContact(workspace.id, id);
  if (!contact) notFound();

  const [deals, stages, { activities, total: activityTotal }, reminders, t, tAll] = await Promise.all([
    listContactDeals(workspace.id, contact.id),
    listStages(workspace.id),
    listActivities(workspace.id, { contactId: contact.id }),
    listPendingReminders(workspace.id, { contactId: contact.id }),
    getTranslations({ locale, namespace: "Contacts" }),
    getTranslations({ locale }),
  ]);
  const now = new Date();
  const back = `/contacts/${contact.id}`;
  // Archivé : consultation seule (rappels, échanges et modification après désarchivage).
  const active = !contact.archived_at;
  const quickAction = "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-sand/70 bg-white px-2 text-sm font-semibold text-lagoon hover:border-lagoon";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/contacts" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToList")}
      </Link>

      {contact.archived_at && (
        <UndoBanner kind="contact" id={contact.id} message={t("archived", { name: contact.name })} undoLabel={t("restore")} back={back} />
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold break-words text-lagoon">{contact.name}</h1>
        {contact.company_name && <p className="text-base text-ink-muted">{contact.company_name}</p>}
        <div className="flex flex-wrap gap-1.5">
          {contact.kind === "company" && <Badge tone="neutral">{t("kind.company")}</Badge>}
          {contact.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        {(contact.phone || contact.email) && (
          <p className="flex flex-col text-base text-ink">
            {contact.phone && <span>{formatPhone(contact.phone)}</span>}
            {contact.email && <span className="break-all">{contact.email}</span>}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {contact.phone && (
          <>
            <a href={telHref(contact.phone)} className={quickAction}>
              <PhoneIcon className="size-5" />
              {t("call")}
            </a>
            <a href={whatsappHref(contact.phone)} target="_blank" rel="noopener noreferrer" className={quickAction}>
              <ChatIcon className="size-5" />
              {t("whatsapp")}
            </a>
          </>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className={quickAction}>
            <MailIcon className="size-5" />
            {t("sendEmail")}
          </a>
        )}
      </div>

      {active && (
        <Card aria-labelledby="reminders-title" className="flex flex-col gap-4">
          <h2 id="reminders-title" className="flex items-center gap-2 text-lg font-bold text-lagoon">
            <BellIcon className="size-5 text-turquoise" />
            {tAll("Reminders.remindMe")}
          </h2>
          {reminders.length > 0 && <ReminderList reminders={reminders} locale={locale} back={back} now={now} />}
          <ReminderForm
            about={{ contactId: contact.id }}
            back={back}
            defaultTitle={tAll("Reminders.defaultTitle", { name: contact.name })}
            minDate={toLocalInputValue(now)}
          />
        </Card>
      )}

      <section aria-labelledby="deals-title" className="flex flex-col gap-3">
        <h2 id="deals-title" className="text-lg font-bold text-lagoon">
          {t("deals.title")}
        </h2>
        {deals.length === 0 ? (
          <p className="text-base text-ink-muted">{t("deals.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {deals.map((deal) => {
              const stage = stages.find((s) => s.id === deal.stage_id);
              return (
                <li key={deal.id}>
                  <DealCard deal={deal} locale={locale} noAmount={tAll("Deals.noAmount")} extra={stage ? stageLabel(tAll, stage.name) : undefined} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {active && (
        <Card aria-labelledby="activity-title" className="flex flex-col gap-4">
          <h2 id="activity-title" className="text-lg font-bold text-lagoon">
            {tAll("Activities.title")}
          </h2>
          <ActivityForm about={{ contactId: contact.id }} back={back} now={toLocalInputValue(now)} />
        </Card>
      )}

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg font-bold text-lagoon">
          {t("history.title")}
        </h2>
        <Timeline activities={activities} total={activityTotal} locale={locale} empty={t("history.empty")} showDeal />
      </section>

      {active && (
        <div className="flex flex-col gap-3 border-t border-sand pt-4">
          <Link href={`/contacts/${contact.id}/modifier`} className={buttonClasses("secondary", true)}>
            {t("edit")}
          </Link>
          <form action={archiveContact} className="flex flex-col gap-1">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="id" value={contact.id} />
            <SubmitButton variant="danger" block>
              {t("archive")}
            </SubmitButton>
            <p className="text-center text-sm text-ink-muted">{t("archiveHint")}</p>
          </form>
        </div>
      )}

      {active && (
        <BottomBar>
          <Link href={`/pipeline/nouveau?contact=${contact.id}`} className={buttonClasses("primary", true)}>
            <PlusIcon className="size-5" />
            {t("deals.new")}
          </Link>
        </BottomBar>
      )}
    </div>
  );
}
