import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrushIcon, ChevronRightIcon, PaletteIcon, WalletIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { setLanguage } from "@/modules/auth/actions";
import { FiscalVerificationPanel } from "@/modules/verification/components/fiscal-verification-panel";
import { getFiscalState } from "@/modules/verification/queries";
import { ProfileForm } from "@/modules/workspace/components/profile-form";
import { hasFiscalInfo } from "@/modules/workspace/profile-schema";
import { getLogoUrl, getManualPayment, requireWorkspace } from "@/modules/workspace/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/reglages">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Settings" });
  return { title: t("metaTitle") };
}

// Ordinateur : offre, paiements et langue dans une colonne collée à gauche, profil à droite.
export default async function SettingsPage({ params }: PageProps<"/[locale]/reglages">) {
  const locale = (await params).locale as Locale;
  const workspace = await requireWorkspace(locale);
  const [manual, logoUrl, fiscal, t, tCommon] = await Promise.all([
    getManualPayment(workspace.id),
    getLogoUrl(workspace.logo_path),
    getFiscalState(workspace),
    getTranslations({ locale, namespace: "Settings" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:content-start lg:items-start lg:gap-x-10">
      <h1 className="text-2xl font-bold text-lagoon lg:col-span-2">{t("title")}</h1>

      <div className="flex flex-col gap-6 lg:sticky lg:top-10">
        <Link
          href="/reglages/offre"
          className="flex min-h-16 items-center gap-3 rounded-card border border-sand/70 bg-sand-light p-4 shadow-card hover:border-lagoon"
          data-testid="settings-plan"
        >
          <span className="flex flex-1 flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="text-base font-bold text-lagoon">{t("plan.title")}</span>
              <Badge>{t(`plan.${workspace.plan}`)}</Badge>
            </span>
            <span className="text-sm text-ink-muted">
              {workspace.plan === "decouverte" ? t("plan.limits.decouverte") : t("plan.limits.paid")}
            </span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
        </Link>

        <Link
          href="/reglages/paiements"
          className="flex min-h-16 items-center gap-3 rounded-card border border-sand/70 bg-sand-light p-4 shadow-card hover:border-lagoon"
        >
          <WalletIcon className="size-6 shrink-0 text-turquoise" />
          <span className="flex flex-1 flex-col">
            <span className="text-base font-bold text-lagoon">{t("payments.title")}</span>
            <span className="text-sm text-ink-muted">{t("payments.description")}</span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
        </Link>

        <Link
          href="/reglages/image-de-marque"
          className="flex min-h-16 items-center gap-3 rounded-card border border-sand/70 bg-sand-light p-4 shadow-card hover:border-lagoon"
          data-testid="settings-branding"
        >
          <BrushIcon className="size-6 shrink-0 text-turquoise" />
          <span className="flex flex-1 flex-col">
            <span className="text-base font-bold text-lagoon">{t("branding.title")}</span>
            <span className="text-sm text-ink-muted">{t("branding.description")}</span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
        </Link>

        <Link
          href="/reglages/apparence"
          className="flex min-h-16 items-center gap-3 rounded-card border border-sand/70 bg-sand-light p-4 shadow-card hover:border-lagoon"
          data-testid="settings-appearance"
        >
          <PaletteIcon className="size-6 shrink-0 text-turquoise" />
          <span className="flex flex-1 flex-col">
            <span className="text-base font-bold text-lagoon">{t("appearance.title")}</span>
            <span className="text-sm text-ink-muted">{t("appearance.description")}</span>
          </span>
          <ChevronRightIcon className="size-5 shrink-0 text-ink-muted" />
        </Link>

        <Card aria-labelledby="language-title" className="flex flex-col gap-3">
          <div>
            <h2 id="language-title" className="text-lg font-bold text-lagoon">
              {t("language.title")}
            </h2>
            <p className="text-sm text-ink-muted">{t("language.hint")}</p>
          </div>
          <form action={setLanguage} className="flex gap-2">
            <input type="hidden" name="current" value={locale} />
            {routing.locales.map((value) => (
              <button
                key={value}
                type="submit"
                name="locale"
                value={value}
                lang={value}
                aria-pressed={value === locale}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border-2 px-4 text-base font-semibold",
                  value === locale ? "border-lagoon bg-lagoon text-on-lagoon" : "border-sand-strong bg-surface text-ink hover:border-lagoon",
                )}
              >
                {tCommon(`languages.${value}`)}
              </button>
            ))}
          </form>
        </Card>
      </div>

      <section aria-labelledby="profile-title" className="flex flex-col gap-4 lg:max-w-2xl">
        <h2 id="profile-title" className="text-lg font-bold text-lagoon">
          {t("profile")}
        </h2>
        <ProfileForm
          locale={locale}
          logoUrl={logoUrl}
          fiscalRequired={hasFiscalInfo(workspace)}
          fiscalStatus={workspace.fiscal_status}
          defaults={{
            name: workspace.name,
            trade: workspace.trade ?? "",
            address: workspace.address ?? "",
            default_currency: workspace.default_currency,
            nif: workspace.nif ?? "",
            stat: workspace.stat ?? "",
            tax_regime: workspace.tax_regime ?? "",
            mvola: manual.mvola,
            rib: manual.rib,
            other: manual.other,
          }}
        />
        <FiscalVerificationPanel
          workspaceId={workspace.id}
          state={fiscal}
          hasNumbers={Boolean(workspace.nif && workspace.stat)}
          locale={locale}
          context="settings"
        />
      </section>
    </div>
  );
}
