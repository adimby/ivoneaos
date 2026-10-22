import { CURRENCIES, formatMoney, type Currency } from "@/lib/money";

// Pipeline : déplacement optimiste d'une opportunité (glisser-déposer), avant la réponse du
// serveur. Les nombres et totaux par étape viennent de pipeline_totals (une ligne par
// étape et par devise, sur toutes les opportunités) : on retire l'opportunité de son
// étape et on l'ajoute à la nouvelle, sans relire la base. Le rafraîchissement qui suit
// l'action serveur remplace ces valeurs par celles de la base.

export type StageTotalRow = { stage_id: string; currency: Currency; deal_count: number; amount_sum: number | null };
export type BoardDeal = { id: string; stage_id: string; currency: Currency; amount: number | null };
export type BoardState<D extends BoardDeal = BoardDeal> = { deals: D[]; totals: StageTotalRow[] };

export function applyMove<D extends BoardDeal>(state: BoardState<D>, dealId: string, toStageId: string): BoardState<D> {
  const deal = state.deals.find((d) => d.id === dealId);
  if (!deal || deal.stage_id === toStageId) return state;
  const moved = { ...deal, stage_id: toStageId };
  // En tête de sa nouvelle colonne : la liste est triée par dernière modification.
  const deals = [moved, ...state.deals.filter((d) => d.id !== dealId)];

  const totals: StageTotalRow[] = [];
  let added = false;
  for (const row of state.totals) {
    if (row.currency !== deal.currency) {
      totals.push(row);
    } else if (row.stage_id === deal.stage_id) {
      const count = row.deal_count - 1;
      if (count <= 0) continue;
      const sum = deal.amount === null || row.amount_sum === null ? row.amount_sum : row.amount_sum - deal.amount;
      // Somme nulle : plus de montant connu dans cette devise (approximation corrigée par
      // le rafraîchissement si des montants à 0 restent dans l'étape).
      totals.push({ ...row, deal_count: count, amount_sum: sum === 0 ? null : sum });
    } else if (row.stage_id === toStageId) {
      added = true;
      const sum = deal.amount === null ? row.amount_sum : (row.amount_sum ?? 0) + deal.amount;
      totals.push({ ...row, deal_count: row.deal_count + 1, amount_sum: sum });
    } else {
      totals.push(row);
    }
  }
  if (!added) totals.push({ stage_id: toStageId, currency: deal.currency, deal_count: 1, amount_sum: deal.amount });
  return { deals, totals };
}

// Nombre d'opportunités d'une étape (toutes devises) et total par devise
// (« 450 000 Ar · 1 200,00 € ») : jamais de conversion.
export function stageSummary(totals: StageTotalRow[], stageId: string, locale: string): { count: number; total: string | null } {
  const rows = totals.filter((t) => t.stage_id === stageId);
  const parts = CURRENCIES.flatMap((currency) => {
    const row = rows.find((t) => t.currency === currency && t.amount_sum !== null);
    return row ? [formatMoney(row.amount_sum!, currency, locale)] : [];
  });
  return { count: rows.reduce((sum, t) => sum + t.deal_count, 0), total: parts.length ? parts.join(" · ") : null };
}
