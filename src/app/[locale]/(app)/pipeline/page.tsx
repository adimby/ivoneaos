import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PipelineIcon, PlusIcon } from "@/components/icons";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { DealCard } from "@/modules/crm/components/deal-card";
import { UndoBanner } from "@/modules/crm/components/undo-banner";
import { getDeal, listDeals, listPipelineTotals, listStages, type PipelineTotal } from "@/modules/crm/queries";
import { stageLabel } from "@/modules/crm/stage-label";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/pipeline">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Deals" });
  return { title: t("metaTitle") };
}

// Total d'une étape, par devise (« 450 000 Ar · 1 200,00 € ») : jamais de conversion ici.
// Calculé en SQL sur toutes les opportunités de l'étape, même au-delà de la liste affichée.
function stageTotal(totals: PipelineTotal[], locale: string): string | null {
  const parts = CURRENCIES.flatMap((currency) => {
    const row = totals.find((t) => t.currency === currency && t.amount_sum !== null);
    return row ? [formatMoney(row.amount_sum, currency, locale)] : [];
  });
  return parts.length ? parts.join(" · ") : null;
}

// Pipeline : les 6 étapes en colonnes à faire défiler du doigt (une par écran), avec un
// raccourci par étape en haut. Changer d'étape se fait depuis l'opportunité.
export default async function PipelinePage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const query = await searchParams;
  const archiveId = typeof query.archive === "string" ? query.archive : null;
  const [stages, { deals, total }, totals, archived, t, tAll] = await Promise.all([
    listStages(workspace.id),
    listDeals(workspace.id),
    listPipelineTotals(workspace.id),
    archiveId ? getDeal(workspace.id, archiveId) : null,
    getTranslations({ locale, namespace: "Deals" }),
    getTranslations({ locale }),
  ]);
  const columns = stages.map((stage) => {
    const stageTotals = totals.filter((t) => t.stage_id === stage.id);
    return {
      stage,
      deals: deals.filter((d) => d.stage_id === stage.id),
      count: stageTotals.reduce((sum, t) => sum + t.deal_count, 0),
      total: stageTotal(stageTotals, locale),
    };
  });

  return (
    <div className="flex flex-1 flex-col gap-5">
      {archived?.archived_at && (
        <UndoBanner kind="deal" id={archived.id} message={t("archived", { title: archived.title })} undoLabel={t("undo")} back="/pipeline" />
      )}
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>

      {deals.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <PipelineIcon className="size-10 text-turquoise" />
          <h2 className="text-lg font-bold text-lagoon">{t("empty.title")}</h2>
          <p className="text-base text-ink-muted">{t("empty.body")}</p>
        </Card>
      ) : (
        <>
          {total > deals.length && (
            <p role="status" className="text-sm text-ink-muted" data-testid="pipeline-truncated">
              {t("truncated", { shown: deals.length, total })}
            </p>
          )}
          <nav aria-label={t("stagesNav")} className="-mx-4 overflow-x-auto px-4">
            <ul className="flex gap-2 pb-1">
              {columns.map(({ stage, count }) => (
                <li key={stage.id} className="shrink-0">
                  <a
                    href={`#etape-${stage.id}`}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
                      count ? "border-lagoon bg-white text-lagoon" : "border-sand bg-white/60 text-ink-muted",
                    )}
                  >
                    {stageLabel(tAll, stage.name)}
                    <span className="rounded-full bg-spray px-2 text-xs text-ink">{count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
            {columns.map(({ stage, deals: inStage, count, total: stageSum }) => {
              return (
                <section
                  key={stage.id}
                  id={`etape-${stage.id}`}
                  aria-labelledby={`etape-${stage.id}-title`}
                  data-testid={`stage-${stage.name}`}
                  className="flex w-[85%] shrink-0 snap-start flex-col gap-3 rounded-card border border-sand/70 bg-sand-light p-3"
                >
                  <header className="flex flex-col gap-0.5">
                    <h2 id={`etape-${stage.id}-title`} className="text-base font-bold text-lagoon">
                      {stageLabel(tAll, stage.name)}
                    </h2>
                    <p className="text-sm text-ink-muted">
                      {t("stageCount", { count })}
                      {stageSum && (
                        <>
                          {" · "}
                          <span className="font-semibold text-ink" data-testid="stage-total">
                            {stageSum}
                          </span>
                        </>
                      )}
                    </p>
                  </header>
                  {inStage.length === 0 ? (
                    <p className="text-sm text-ink-muted">{t("stageEmpty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {inStage.map((deal) => (
                        <li key={deal.id}>
                          <DealCard deal={deal} locale={locale} noAmount={t("noAmount")} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <BottomBar>
        <Link href="/pipeline/nouveau" className={buttonClasses("primary", true)}>
          <PlusIcon className="size-5" />
          {t("new")}
        </Link>
      </BottomBar>
    </div>
  );
}
