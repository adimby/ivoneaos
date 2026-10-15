// Coordonnées de paiement direct (payment_accounts.manual_instructions, texte affiché tel
// quel sur la facture publique) : une ligne par moyen, libellés compris dans toutes les langues.

export type ManualPayment = { mvola: string; rib: string };

export function formatMvola(national: string): string {
  return national.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})$/, "$1 $2 $3 $4");
}

export function composeManualInstructions({ mvola, rib }: ManualPayment): string | null {
  const lines = [mvola && `MVola : ${formatMvola(mvola)}`, rib && `RIB : ${rib}`].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export function parseManualInstructions(text: string | null | undefined): ManualPayment {
  const value = (label: string) =>
    text?.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "m"))?.[1].replace(/\s/g, "") ?? "";
  return { mvola: value("MVola"), rib: value("RIB") };
}
