// Coordonnées de paiement direct (payment_accounts.manual_instructions, texte affiché tel
// quel sur la facture publique et le PDF) : une ligne par moyen, libellés compris dans
// toutes les langues. « other » : une ligne libre (IBAN et BIC, PayPal, Wise…) pour les
// clients à l'étranger, utile surtout pour les factures en euros ou en dollars.

export type ManualPayment = { mvola: string; rib: string; other: string };

const LABELLED = /^(MVola|RIB)\s*:/;

export function formatMvola(national: string): string {
  return national.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})$/, "$1 $2 $3 $4");
}

export function composeManualInstructions({ mvola, rib, other }: ManualPayment): string | null {
  const lines = [mvola && `MVola : ${formatMvola(mvola)}`, rib && `RIB : ${rib}`, other.trim()].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export function parseManualInstructions(text: string | null | undefined): ManualPayment {
  const value = (label: string) =>
    text?.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "m"))?.[1].replace(/\s/g, "") ?? "";
  const other = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !LABELLED.test(line))
    .join(" ");
  return { mvola: value("MVola"), rib: value("RIB"), other };
}
