import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { dbErrorKey } from "@/lib/db-errors";
import type { Locale } from "@/i18n/routing";
import { getAdminHistory, getAdminQueue, isPlatformAdmin } from "@/modules/verification/queries";
import { formatAdminDate } from "@/modules/verification/view";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/admin/verifications">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("metaTitle") };
}

// Admins de la plateforme seulement (404 sinon : proxy, puis ici) : demandes de
// vérification de carte fiscale en attente, puis les dernières décisions (sans images).
// Ordinateur d'abord : file à gauche, historique à droite ; une colonne au téléphone.
export default async function AdminVerificationsPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  await requireWorkspace(locale);
  if (!(await isPlatformAdmin())) notFound();
  const query = await searchParams;
  const [queue, history, t, tAll] = await Promise.all([
    getAdminQueue(),
    getAdminHistory(20),
    getTranslations({ locale, namespace: "Admin" }),
    getTranslations({ locale }),
  ]);
  const ok = query.ok === "verified" || query.ok === "rejected" ? query.ok : null;
  const emailSent = query.email === "sent";
  const error = typeof query.erreur === "string" ? dbErrorKey({ message: query.erreur }) : null;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:content-start lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-2 lg:col-span-2">
        <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
        <p className="text-base text-ink-muted">{t("intro")}</p>
        {ok && (
          <Alert tone="success">
            <span className="block" data-testid="admin-ok">
              {t(`ok.${ok}`)}
            </span>
            <span className="block" data-testid="admin-ok-email">
              {t(emailSent ? "ok.emailSent" : "ok.emailNotSent")}
            </span>
          </Alert>
        )}
        {error && (
          <Alert tone="error">
            <span data-testid="admin-error">{tAll(`errors.db.${error}`)}</span>
          </Alert>
        )}
      </div>

      <section aria-labelledby="queue-title" className="flex flex-col gap-3">
        <h2 id="queue-title" className="text-lg font-bold text-lagoon">
          {t("queueTitle", { count: queue.length })}
        </h2>
        {queue.length === 0 ? (
          <Card>
            <p className="text-base text-ink-muted" data-testid="admin-queue-empty">
              {t("queueEmpty")}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="admin-queue">
            {queue.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/verifications/${request.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-card border border-sand/70 bg-sand-light p-4 shadow-card hover:border-lagoon"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-base font-bold text-lagoon">{request.workspace_name}</span>
                    <span className="text-sm break-all text-ink">
                      {t("nif")} {request.nif} · {t("stat")} {request.stat}
                    </span>
                    <span className="text-sm text-ink-muted">{t("submittedAt", { date: formatAdminDate(request.created_at, locale) })}</span>
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg font-bold text-lagoon">
          {t("historyTitle")}
        </h2>
        {history.length === 0 ? (
          <Card>
            <p className="text-base text-ink-muted">{t("historyEmpty")}</p>
          </Card>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-sand/70" data-testid="admin-history">
              {history.map((decision) => (
                <li key={decision.id} className="flex flex-col gap-1 p-4">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{decision.workspace_name}</span>
                    <Badge tone={decision.status === "verified" ? "success" : "danger"}>
                      {t(decision.status === "verified" ? "verified" : "rejected")}
                    </Badge>
                  </span>
                  <span className="text-sm text-ink-muted">
                    {decision.method === "automatic"
                      ? t("byAutomatic", { date: formatAdminDate(decision.decided_at, locale) })
                      : t("byAdmin", { date: formatAdminDate(decision.decided_at, locale), email: decision.decided_by_email ?? "?" })}
                  </span>
                  {decision.rejection_reason && <span className="text-sm text-ink">{t("reasonShown", { reason: decision.rejection_reason })}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
