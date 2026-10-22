import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PipelineIcon, PlusIcon } from "@/components/icons";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { DealCard } from "@/modules/crm/components/deal-card";
import { PipelineBoard } from "@/modules/crm/components/pipeline-board";
import { UndoBanner } from "@/modules/crm/components/undo-banner";
import { getDeal, listDeals, listPipelineTotals, listStages } from "@/modules/crm/queries";
import { stageLabel } from "@/modules/crm/stage-label";
import { requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/pipeline">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Deals" });
  return { title: t("metaTitle") };
}

// Pipeline : les 6 étapes en colonnes à faire défiler du doigt (une par écran sur
// téléphone, deux sur tablette), avec un raccourci par étape en haut. Ordinateur : toutes
// les étapes visibles sans défilement caché, en 3 colonnes sur 2 rangées sur un petit
// portable (lg, moins de 1280 px), puis les 6 colonnes côte à côte (kanban, xl).
// Pas de raccourcis sur ordinateur. Tablette et ordinateur : glisser une carte vers une
// autre colonne change son étape (PipelineBoard) ; partout, et seul moyen au téléphone et
// au clavier, l'opportunité propose « Étape suivante » et le choix d'une étape.
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

  return (
    <div className="flex flex-1 flex-col gap-5">
      {archived?.archived_at && (
        <UndoBanner kind="deal" id={archived.id} message={t("archived", { title: archived.title })} undoLabel={t("undo")} back="/pipeline" />
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
        {/* Ordinateur : action principale en haut à droite (la barre du bas est masquée). */}
        <div className="hidden lg:block">
          <Link href="/pipeline/nouveau" className={buttonClasses("primary")}>
            <PlusIcon className="size-5" />
            {t("new")}
          </Link>
        </div>
      </div>

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
          <PipelineBoard
            stages={stages.map((stage) => ({ id: stage.id, name: stage.name, kind: stage.kind, label: stageLabel(tAll, stage.name) }))}
            deals={deals.map(({ id, title, stage_id, currency, amount }) => ({ id, title, stage_id, currency, amount }))}
            totals={totals}
            cards={Object.fromEntries(
              deals.map((deal) => [deal.id, <DealCard key={deal.id} deal={deal} locale={locale} noAmount={t("noAmount")} column />]),
            )}
          />
        </>
      )}

      <BottomBar className="lg:hidden">
        <Link href="/pipeline/nouveau" className={buttonClasses("primary", true)}>
          <PlusIcon className="size-5" />
          {t("new")}
        </Link>
      </BottomBar>
    </div>
  );
}
