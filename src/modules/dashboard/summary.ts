import { convertMinor, type Currency } from "@/lib/money";

// Chiffres du tableau de bord à partir des totaux calculés par la base
// (dashboard_invoice_totals, pipeline_totals). Module pur, testé.
// Factures : converties dans la devise par défaut au taux de chaque facture
// (exchange_rate). Un montant sans taux utilisable (autre devise, taux 1) n'est jamais
// additionné en silence : il reste à part, dans sa devise (unconverted).
// Opportunités : pas de taux saisi, donc jamais converties : un total par devise.
// Le taux d'une facture est exprimé vers la devise par défaut du moment de l'émission ;
// celle-ci ne change plus dès qu'une facture est émise (default_currency_locked, en base),
// et la changer avant remet à 1 le taux des brouillons en autre devise (à ressaisir avant
// l'émission). Seules les factures émises sont comptées ici : taux et devise concordent.

export type InvoiceTotalRow = {
  kind: string;
  currency: Currency;
  exchange_rate: number;
  overdue: boolean;
  item_count: number;
  amount: number;
};

export type PipelineTotalRow = { stage_id: string; currency: Currency; deal_count: number; amount_sum: number | null };
export type StageRow = { id: string; name: string; kind: "open" | "won" | "lost" };

export type MoneyByCurrency = { currency: Currency; amount: number }[];

export type DashboardSummary = {
  currency: Currency;
  collected: { amount: number; count: number; unconverted: MoneyByCurrency };
  pending: {
    amount: number;
    count: number;
    overdueAmount: number;
    overdueCount: number;
    unconverted: MoneyByCurrency;
    overdueUnconverted: MoneyByCurrency;
  };
  // Étapes ouvertes, dans l'ordre du pipeline (toutes, même vides).
  deals: { stageId: string; name: string; count: number; amounts: MoneyByCurrency }[];
  openDeals: number;
};

function addTo(list: MoneyByCurrency, currency: Currency, amount: number) {
  const found = list.find((m) => m.currency === currency);
  if (found) found.amount += amount;
  else list.push({ currency, amount });
}

// Devise par défaut d'abord, puis l'ordre alphabétique : affichage stable.
function sorted(list: MoneyByCurrency, first: Currency): MoneyByCurrency {
  return list
    .filter((m) => m.amount !== 0)
    .sort((a, b) => (a.currency === first ? -1 : b.currency === first ? 1 : a.currency.localeCompare(b.currency)));
}

// null : pas de taux utilisable (autre devise et taux 1, ou taux invalide).
function toDefault(amount: number, currency: Currency, target: Currency, rate: number): number | null {
  if (currency === target) return amount;
  if (!(rate > 0) || rate === 1) return null;
  return convertMinor(amount, currency, target, rate);
}

export function summarizeDashboard({
  invoiceTotals,
  pipelineTotals,
  stages,
  defaultCurrency,
}: {
  invoiceTotals: InvoiceTotalRow[];
  pipelineTotals: PipelineTotalRow[];
  stages: StageRow[];
  defaultCurrency: Currency;
}): DashboardSummary {
  const collected = { amount: 0, count: 0, unconverted: [] as MoneyByCurrency };
  const pending = {
    amount: 0,
    count: 0,
    overdueAmount: 0,
    overdueCount: 0,
    unconverted: [] as MoneyByCurrency,
    overdueUnconverted: [] as MoneyByCurrency,
  };

  for (const row of invoiceTotals) {
    const converted = toDefault(row.amount, row.currency, defaultCurrency, Number(row.exchange_rate));
    if (row.kind === "collected") {
      collected.count += row.item_count;
      if (converted === null) addTo(collected.unconverted, row.currency, row.amount);
      else collected.amount += converted;
    } else if (row.kind === "pending") {
      pending.count += row.item_count;
      if (row.overdue) pending.overdueCount += row.item_count;
      if (converted === null) {
        addTo(pending.unconverted, row.currency, row.amount);
        if (row.overdue) addTo(pending.overdueUnconverted, row.currency, row.amount);
      } else {
        pending.amount += converted;
        if (row.overdue) pending.overdueAmount += converted;
      }
    }
  }

  const open = stages.filter((s) => s.kind === "open");
  const deals = open.map((stage) => {
    const amounts: MoneyByCurrency = [];
    let count = 0;
    for (const row of pipelineTotals) {
      if (row.stage_id !== stage.id) continue;
      count += row.deal_count;
      if (row.amount_sum) addTo(amounts, row.currency, row.amount_sum);
    }
    return { stageId: stage.id, name: stage.name, count, amounts: sorted(amounts, defaultCurrency) };
  });

  return {
    currency: defaultCurrency,
    collected: { ...collected, unconverted: sorted(collected.unconverted, defaultCurrency) },
    pending: {
      ...pending,
      unconverted: sorted(pending.unconverted, defaultCurrency),
      overdueUnconverted: sorted(pending.overdueUnconverted, defaultCurrency),
    },
    deals,
    openDeals: deals.reduce((sum, d) => sum + d.count, 0),
  };
}

// Chiffre affiché : le montant converti, et à part (« En plus : … ») les montants sans
// taux. Rien de converti mais des montants sans taux : ce sont eux le chiffre principal,
// jamais un « 0 Ar » trompeur.
export function displayAmounts(
  amount: number,
  currency: Currency,
  unconverted: MoneyByCurrency,
): { main: MoneyByCurrency; extra: MoneyByCurrency } {
  if (amount === 0 && unconverted.length > 0) return { main: unconverted, extra: [] };
  return { main: [{ currency, amount }], extra: unconverted };
}
