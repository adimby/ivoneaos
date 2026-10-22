"use client";

import { useEffect, useId, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/components/ui/cn";
import { moveDeal } from "../actions";
import { applyMove, stageSummary, type BoardDeal, type StageTotalRow } from "../pipeline-move";
import { needsConfirmation, type StageKind } from "../stages";
import { StageConfirmDialog } from "./stage-button";

type BoardStage = { id: string; name: string; kind: StageKind; label: string };
type Deal = BoardDeal & { title: string };

// Glisser-déposer actif seulement quand les colonnes sont côte à côte (tablette et
// ordinateur, à partir de md). Téléphone : une étape par écran, on change d'étape depuis
// l'opportunité (« Étape suivante »).
const COLUMNS_SIDE_BY_SIDE = "(min-width: 48rem)";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Colonnes du pipeline, rendues côté serveur ; côté client, seulement le déplacement des
// cartes (cartes elles-mêmes rendues par le serveur, passées dans cards) et les nombres et
// totaux par étape mis à jour aussitôt (mise à jour optimiste). Le changement d'étape
// passe par l'action serveur moveDeal, comme le bouton de l'opportunité.
export function PipelineBoard({
  stages,
  deals,
  totals,
  cards,
}: {
  stages: BoardStage[];
  deals: Deal[];
  totals: StageTotalRow[];
  cards: Record<string, ReactNode>;
}) {
  const t = useTranslations("Deals");
  const locale = useLocale();
  const enabled = useMediaQuery(COLUMNS_SIDE_BY_SIDE);
  const base = useMemo(() => ({ deals, totals }), [deals, totals]);
  const [board, moveOptimistic] = useOptimistic(base, (state, move: { id: string; to: string }) => applyMove(state, move.id, move.to));
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ deal: Deal; stage: BoardStage } | null>(null);
  // Cartes dont le déplacement attend la réponse du serveur : on ne peut pas les reprendre
  // avant (deux envois croisés pourraient arriver dans le désordre et le message d'erreur
  // du premier dirait une étape fausse).
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  // Carte dont le lien avait le focus au début du glisser : remontée dans une autre
  // colonne, elle le perd ; on le lui rend.
  const refocus = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dndId = useId();

  // Souris : le glisser commence après 5 px (un simple clic ouvre la carte). Tactile :
  // appui long de 250 ms sans bouger, pour ne pas gêner le défilement.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  useEffect(() => {
    if (confirm && !dialog.current?.open) dialog.current?.showModal();
  }, [confirm]);

  // Après chaque changement des cartes (dépôt, retour arrière, rafraîchissement), sans
  // voler le focus s'il est ailleurs que sur la page elle-même.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    const frame = requestAnimationFrame(() => {
      const current = document.activeElement;
      if (current && current !== document.body) return;
      document.querySelector<HTMLElement>(`[data-deal-id="${id}"] a`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [board]);

  const stageById = (id: unknown) => stages.find((s) => s.id === id);
  const dealById = (id: unknown) => board.deals.find((d) => d.id === id);

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("drag.start", { title: dealById(active.id)?.title ?? "" }),
    onDragOver: ({ over }) => (over ? t("drag.over", { stage: stageById(over.id)?.label ?? "" }) : t("drag.outside")),
    onDragEnd: ({ active, over }) =>
      !over || over.id === dealById(active.id)?.stage_id ? t("drag.unchanged", { title: dealById(active.id)?.title ?? "" }) : undefined,
    onDragCancel: ({ active }) => t("drag.unchanged", { title: dealById(active.id)?.title ?? "" }),
  };

  function setPendingFor(id: string, on: boolean) {
    setPending((ids) => {
      const next = new Set(ids);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // La carte change de colonne aussitôt (optimiste) ; l'annonce « déplacée » attend la
  // confirmation du serveur.
  function commit(deal: Deal, stage: BoardStage) {
    const from = stageById(deal.stage_id);
    setError(null);
    setAnnouncement("");
    setPendingFor(deal.id, true);
    const data = new FormData();
    data.set("locale", locale);
    data.set("back", "/pipeline");
    data.set("id", deal.id);
    data.set("stage_id", stage.id);
    startTransition(async () => {
      moveOptimistic({ id: deal.id, to: stage.id });
      let moved: boolean | null = null;
      try {
        ({ moved } = await moveDeal(data));
      } catch {
        // Réseau coupé ou erreur du serveur : la carte revient d'elle-même (fin de la
        // transition), le message dit où elle est restée.
      }
      setPendingFor(deal.id, false);
      if (moved) setAnnouncement(t("drag.moved", { title: deal.title, stage: stage.label }));
      // Refus : opportunité archivée ou disparue ailleurs. L'action a rafraîchi la page,
      // la carte quitte le pipeline.
      else if (moved === false) setError(t("drag.unavailable", { title: deal.title }));
      else setError(t("drag.error", { title: deal.title, stage: from?.label ?? "" }));
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const deal = dealById(active.id);
    const stage = stageById(over?.id);
    // Hors d'une colonne, ou reposée dans la sienne : rien ne change.
    if (!deal || !stage || stage.id === deal.stage_id) return;
    if (needsConfirmation(stage)) setConfirm({ deal, stage });
    else commit(deal, stage);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={pointerWithin}
      accessibility={{ announcements }}
      onDragStart={({ active }) => {
        setError(null);
        setActiveId(String(active.id));
        const focused = document.activeElement?.closest<HTMLElement>("[data-deal-id]");
        refocus.current = focused?.dataset.dealId === active.id ? String(active.id) : null;
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <p className="sr-only" role="status" aria-live="polite" data-testid="pipeline-announcement">
        {announcement}
      </p>
      {enabled && <p className="sr-only">{t("drag.instructions")}</p>}
      <nav aria-label={t("stagesNav")} className="-mx-4 overflow-x-auto px-4 md:-mx-8 md:px-8 lg:hidden">
        <ul className="flex gap-2 pb-1">
          {stages.map((stage) => {
            const { count } = stageSummary(board.totals, stage.id, locale);
            return (
              <li key={stage.id} className="shrink-0">
                <a
                  href={`#etape-${stage.id}`}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
                    count ? "border-lagoon bg-surface text-lagoon" : "border-sand bg-surface/60 text-ink-muted",
                  )}
                >
                  {stage.label}
                  <span className="rounded-full bg-spray px-2 text-xs text-ink">{count}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div
        data-testid="pipeline-board"
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:scroll-px-8 md:px-8 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-3 lg:overflow-visible lg:px-0 xl:grid-cols-6"
      >
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} summary={stageSummary(board.totals, stage.id, locale)}>
            {board.deals
              .filter((d) => d.stage_id === stage.id)
              .map((deal) => (
                <DraggableDeal key={deal.id} id={deal.id} enabled={enabled} busy={pending.has(deal.id)}>
                  {cards[deal.id]}
                </DraggableDeal>
              ))}
          </Column>
        ))}
      </div>
      {/* Fantôme qui suit le pointeur : copie inerte de la carte, hors de l'arbre accessible. */}
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div aria-hidden inert className="cursor-grabbing rounded-xl shadow-card ring-2 ring-lagoon">
            {cards[activeId]}
          </div>
        ) : null}
      </DragOverlay>
      {confirm && (
        <StageConfirmDialog
          dialogRef={dialog}
          kind={confirm.stage.kind as "won" | "lost"}
          onClose={() => {
            // Annuler, Échap : la carte reste à sa place, comme un dépôt hors d'une colonne.
            if (dialog.current?.returnValue !== "confirmed") setAnnouncement(t("drag.unchanged", { title: confirm.deal.title }));
            setConfirm(null);
          }}
          onConfirm={() => {
            dialog.current?.close("confirmed");
            commit(confirm.deal, confirm.stage);
          }}
        />
      )}
    </DndContext>
  );
}

function Column({ stage, summary, children }: { stage: BoardStage; summary: { count: number; total: string | null }; children: ReactNode[] }) {
  const t = useTranslations("Deals");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      id={`etape-${stage.id}`}
      aria-labelledby={`etape-${stage.id}-title`}
      data-testid={`stage-${stage.name}`}
      data-over={isOver || undefined}
      className={cn(
        "flex w-[85%] shrink-0 snap-start flex-col gap-3 rounded-card border p-3 md:w-[calc(50%-0.375rem)] lg:min-h-48 lg:w-auto lg:min-w-0 xl:min-h-80",
        // Colonne survolée pendant un glisser : contour et fond légers du thème. Alternative
        // explicite : cn ne fusionne pas, deux couleurs de bordure se départageraient par
        // l'ordre du CSS, pas par celui des classes.
        isOver ? "border-lagoon bg-turquoise-soft ring-2 ring-lagoon" : "border-sand/70 bg-sand-light",
      )}
    >
      <header className="flex flex-col gap-0.5">
        <h2 id={`etape-${stage.id}-title`} className="text-base font-bold text-lagoon">
          {stage.label}
        </h2>
        {/* Ordinateur (colonne étroite) : nombre et total sur deux lignes. Le total passe à
            la ligne entre deux devises, jamais dans un nombre (espaces insécables du format) ;
            un nombre plus large que la colonne seul se coupe plutôt que de déborder. */}
        <p className="text-sm text-ink-muted" data-testid="stage-count">
          {t("stageCount", { count: summary.count })}
          {summary.total && (
            <>
              <span className="lg:hidden">{" · "}</span>
              <span className="font-semibold break-words text-ink lg:block" data-testid="stage-total">
                {summary.total}
              </span>
            </>
          )}
        </p>
      </header>
      {children.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("stageEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

// La carte reste un lien (clic ou Entrée ouvrent l'opportunité) : seuls les écouteurs du
// glisser sont posés sur l'élément qui l'entoure, sans rôle ni tabindex ajoutés. busy :
// déplacement en attente du serveur, la carte ne se reprend pas avant la réponse.
// touch-manipulation : recommandé par @dnd-kit pour le capteur tactile (pas de zoom au
// double appui).
function DraggableDeal({ id, enabled, busy, children }: { id: string; enabled: boolean; busy: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled: !enabled || busy });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      data-deal-id={id}
      data-draggable={enabled || undefined}
      data-dragging={isDragging || undefined}
      aria-busy={busy || undefined}
      className={cn(enabled && "touch-manipulation select-none [-webkit-touch-callout:none]", isDragging && "opacity-40")}
    >
      {children}
    </li>
  );
}
