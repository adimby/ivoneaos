import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { dbErrorKey } from "@/lib/db-errors";
import { PlanLimitLink } from "@/modules/workspace/components/plan-limit-link";

const OK = ["sent", "accepted", "declined", "converted", "paid", "cancelled"] as const;
const EMAIL = ["sent", "skipped", "failed", "no_email", "throttled"] as const;
// Lien Papi non créé à l'envoi (raison renvoyée par sendInvoice).
const PAPI = ["unauthorized", "rejected", "conflict", "unavailable", "disabled"] as const;

// Résultat de la dernière action (paramètres ?ok=, ?erreur=, ?email=, ?papi=, ?whop= posés par les
// actions serveur) : refus de la base traduit (limite de l'offre comprise), succès.
// manualPayment : la freelance a des coordonnées directes (MVola, RIB) affichées au client.
export function Notices({ query, manualPayment = false }: { query: Record<string, string | string[] | undefined>; manualPayment?: boolean }) {
  const t = useTranslations();
  const ok = typeof query.ok === "string" && (OK as readonly string[]).includes(query.ok) ? (query.ok as (typeof OK)[number]) : null;
  const email =
    typeof query.email === "string" && (EMAIL as readonly string[]).includes(query.email) ? (query.email as (typeof EMAIL)[number]) : null;
  const papi =
    typeof query.papi === "string" && (PAPI as readonly string[]).includes(query.papi) ? (query.papi as (typeof PAPI)[number]) : null;
  // Paiement par carte (Whop) non préparé à l'envoi.
  const whop = query.whop === "failed";
  const error = typeof query.erreur === "string" ? dbErrorKey({ message: query.erreur }) : null;
  if (!ok && !email && !error && !papi && !whop) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="notices">
      {error && <Alert tone="error">{t(`errors.db.${error}`)}</Alert>}
      <PlanLimitLink error={error} />
      {ok && !error && <Alert tone="success">{t(`Billing.notices.${ok}`)}</Alert>}
      {email && <Alert tone={email === "sent" ? "success" : "error"}>{t(`Billing.email.${email}`)}</Alert>}
      {papi && <Alert tone="error">{t(`Billing.papi.${papi}`, { manual: manualPayment ? "yes" : "no" })}</Alert>}
      {whop && <Alert tone="error">{t("Billing.whop.failed", { manual: manualPayment ? "yes" : "no" })}</Alert>}
    </div>
  );
}
