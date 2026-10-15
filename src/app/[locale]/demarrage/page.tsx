import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { Brand } from "@/components/brand";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireUserId } from "@/lib/session";
import { AccountControls } from "@/modules/auth/components/account-controls";
import { safeNextPath } from "@/modules/auth/next-path";
import { OnboardingForm } from "@/modules/onboarding/components/onboarding-form";
import { EMPTY_DIAGNOSTIC } from "@/modules/onboarding/diagnostic-fields";
import { getDiagnosticDefaults } from "@/modules/onboarding/queries";
import { EMPTY_PROFILE } from "@/modules/workspace/components/profile-fields";
import { getCurrentWorkspace, getManualPayment, isOnboarded } from "@/modules/workspace/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/demarrage">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("metaTitle") };
}

// Accueil guidé (P1) : obligatoire tant que le profil pro n'est pas complet.
type Props = PageProps<"/[locale]/demarrage">;

export default async function OnboardingPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="on-dark bg-lagoon pt-safe text-white">
        {/* Langue et déconnexion : possibles avant la fin de l'accueil (mauvais compte, langue). */}
        <div className="px-safe mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2">
          <Brand />
          <Suspense fallback={<AccountControls locale={locale} back="/demarrage" />}>
            <HeaderControls locale={locale} searchParams={searchParams} />
          </Suspense>
        </div>
      </header>
      <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col pt-5">
        <Suspense fallback={<PageSkeleton />}>
          <Onboarding locale={locale} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function readNext(searchParams: Props["searchParams"]) {
  const raw = (await searchParams).next;
  return safeNextPath(typeof raw === "string" ? raw : null);
}

// Changer de langue garde la page demandée avant la connexion (?next=).
async function HeaderControls({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  const next = await readNext(searchParams);
  return <AccountControls locale={locale} back={next ? `/demarrage?next=${encodeURIComponent(next)}` : "/demarrage"} />;
}

async function Onboarding({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  await requireUserId(locale);
  // Page demandée avant la connexion : on y va une fois l'accueil terminé.
  const next = await readNext(searchParams);
  const workspace = await getCurrentWorkspace();
  if (isOnboarded(workspace)) return redirect({ href: next ?? "/tableau-de-bord", locale });

  // Workspace commencé (essai interrompu) : on reprend ses valeurs, diagnostic compris.
  const [manual, diagnostic] = workspace
    ? await Promise.all([getManualPayment(workspace.id), getDiagnosticDefaults(workspace.id)])
    : [{ mvola: "", rib: "" }, EMPTY_DIAGNOSTIC];
  const defaults = workspace
    ? {
        name: workspace.name,
        trade: workspace.trade ?? "",
        address: workspace.address ?? "",
        default_currency: workspace.default_currency,
        nif: workspace.nif ?? "",
        stat: workspace.stat ?? "",
        tax_regime: workspace.tax_regime ?? "",
        ...manual,
      }
    : EMPTY_PROFILE;
  return <OnboardingForm locale={locale} defaults={defaults} diagnostic={diagnostic} next={next} />;
}
