import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { dbErrorKey } from "@/lib/db-errors";

const OK = ["sent", "accepted", "declined", "converted", "paid", "cancelled"] as const;
const EMAIL = ["sent", "skipped", "failed", "no_email", "throttled"] as const;

// Résultat de la dernière action (paramètres ?ok=, ?erreur=, ?email= posés par les
// actions serveur) : refus de la base traduit (limite de l'offre comprise), succès.
export function Notices({ query }: { query: Record<string, string | string[] | undefined> }) {
  const t = useTranslations();
  const ok = typeof query.ok === "string" && (OK as readonly string[]).includes(query.ok) ? (query.ok as (typeof OK)[number]) : null;
  const email =
    typeof query.email === "string" && (EMAIL as readonly string[]).includes(query.email) ? (query.email as (typeof EMAIL)[number]) : null;
  const error = typeof query.erreur === "string" ? dbErrorKey({ message: query.erreur }) : null;
  if (!ok && !email && !error) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="notices">
      {error && <Alert tone="error">{t(`errors.db.${error}`)}</Alert>}
      {ok && !error && <Alert tone="success">{t(`Billing.notices.${ok}`)}</Alert>}
      {email && <Alert tone={email === "sent" ? "success" : "error"}>{t(`Billing.email.${email}`)}</Alert>}
    </div>
  );
}
