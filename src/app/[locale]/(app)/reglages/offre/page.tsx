import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ivoneaContactEmail } from "@/lib/contact-email";
import { formatMoney } from "@/lib/money";
import { PLAN_LIMITS, PLAN_MONTHLY_PRICE_MGA, PLANS, planMeters, type Plan } from "@/modules/workspace/plan";
import { getPlanUsage, requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/reglages/offre">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Plan" });
  return { title: t("metaTitle") };
}

// Réglages > Offre : offre actuelle, usage du mois (Découverte : 20 contacts actifs, 3
// devis ou factures envoyés), offres payantes et contact. Aucun JavaScript.
export default async function PlanPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const [usage, t, tSettings] = await Promise.all([
    getPlanUsage(workspace.id),
    getTranslations({ locale, namespace: "Plan" }),
    getTranslations({ locale, namespace: "Settings" }),
  ]);
  const plan = workspace.plan as Plan;
  const meters = planMeters(plan, usage);
  const limitReached = meters.some((m) => m.reached);
  // Absente (hors production, où la construction l'exige) : une consigne sans lien.
  const email = ivoneaContactEmail();
  const target: Plan = plan === "decouverte" ? "lancement" : plan;
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(t("contact.subject", { plan: tSettings(`plan.${target}`), business: workspace.name }))}`
    : null;

  const price = (p: Plan) => {
    const amount = PLAN_MONTHLY_PRICE_MGA[p];
    if (amount === 0) return t("price.free");
    if (amount) return t("price.monthly", { amount: formatMoney(amount, "MGA", locale) });
    return t("price.onRequest");
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href="/reglages" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
        ← {t("backToSettings")}
      </Link>
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>

      <Card aria-labelledby="current-title" className="flex flex-col gap-4" data-testid="plan-current">
        <div className="flex items-center justify-between gap-3">
          <h2 id="current-title" className="text-lg font-bold text-lagoon">
            {t("current")}
          </h2>
          <Badge data-testid="plan-name">{tSettings(`plan.${plan}`)}</Badge>
        </div>
        <ul className="flex flex-col gap-4">
          {meters.map((m) => (
            <li key={m.key} className="flex flex-col gap-1.5" data-testid={`usage-${m.key}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-base text-ink">{t(`usage.${m.key}`)}</span>
                <span className={cn("text-base font-bold", m.reached ? "text-danger" : "text-ink")}>
                  {m.limit === null ? t("usage.unlimited", { used: m.used }) : t("usage.count", { used: m.used, limit: m.limit })}
                </span>
              </div>
              {m.limit !== null && (
                <div
                  role="progressbar"
                  aria-label={t(`usage.${m.key}`)}
                  aria-valuemin={0}
                  aria-valuemax={m.limit}
                  aria-valuenow={Math.min(m.used, m.limit)}
                  className="h-2 overflow-hidden rounded-full bg-sand/60"
                >
                  <div
                    className={cn("h-full rounded-full", m.reached ? "bg-danger" : "bg-turquoise")}
                    style={{ width: `${Math.min(100, (m.used / m.limit) * 100)}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
        {plan === "decouverte" && <p className="text-sm text-ink-muted">{t("usage.monthNote")}</p>}
      </Card>

      {limitReached && <Alert tone="error">{t("limitReached")}</Alert>}

      <section aria-labelledby="offers-title" className="flex flex-col gap-3">
        <h2 id="offers-title" className="text-lg font-bold text-lagoon">
          {t("offers")}
        </h2>
        <ul className="flex flex-col gap-3">
          {PLANS.map((p) => {
            const limits = PLAN_LIMITS[p];
            return (
              <li
                key={p}
                data-testid={`offer-${p}`}
                className={cn("flex flex-col gap-1 rounded-card border bg-white p-4", p === plan ? "border-2 border-lagoon" : "border-sand/70")}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-bold text-lagoon">{tSettings(`plan.${p}`)}</h3>
                  {p === plan && <Badge tone="success">{t("yours")}</Badge>}
                </div>
                <p className="text-base font-semibold text-ink">{price(p)}</p>
                <p className="text-sm text-ink-muted">
                  {limits.activeContacts === null
                    ? t("includes.unlimited")
                    : t("includes.limited", { contacts: limits.activeContacts, documents: limits.documentsPerMonth ?? 0 })}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <BottomBar>
        <p className="text-sm text-ink-muted">{t("contact.body")}</p>
        {mailto ? (
          <a href={mailto} className={buttonClasses("primary", true)} data-testid="plan-contact">
            {plan === "decouverte" ? t("contact.upgrade") : t("contact.write")}
          </a>
        ) : (
          <p className="text-base font-semibold text-ink">{t("contact.noEmail")}</p>
        )}
      </BottomBar>
    </div>
  );
}
