import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const LIMIT_ERRORS = ["free_limit_reached", "contact_limit_reached"];

// Sous un refus « limite de l'offre Découverte » : lien direct vers Réglages > Offre.
export function PlanLimitLink({ error }: { error: string | null | undefined }) {
  const t = useTranslations("Plan");
  if (!error || !LIMIT_ERRORS.includes(error)) return null;
  return (
    <Link
      href="/reglages/offre"
      className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon underline underline-offset-4"
      data-testid="plan-limit-link"
    >
      {t("seeOffers")}
    </Link>
  );
}
