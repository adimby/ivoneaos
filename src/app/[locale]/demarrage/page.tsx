import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
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

// Accueil guidé (P1) : obligatoire tant que le profil pro (nom, métier, adresse) n'est pas
// enregistré. Les données fiscales viennent avant la première facture.
type Props = PageProps<"/[locale]/demarrage">;

export default async function OnboardingPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  // Une seule frontière : l'en-tête (langue, déconnexion) apparaît avec le contenu. Un
  // en-tête rendu à part pouvait s'afficher plus tard que le contenu, et son remplaçant
  // provisoire (sans ?next) changeait la langue en perdant la page demandée.
  return (
    <Suspense fallback={<Shell controls={null}><PageSkeleton /></Shell>}>
      <Onboarding locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

function Shell({ controls, children }: { controls: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="on-dark bg-lagoon pt-safe text-white">
        {/* Langue et déconnexion : possibles avant la fin de l'accueil (mauvais compte, langue). */}
        <div className="px-safe mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2">
          <Brand />
          {controls}
        </div>
      </header>
      <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col pt-5">{children}</main>
    </div>
  );
}

async function readNext(searchParams: Props["searchParams"]) {
  const raw = (await searchParams).next;
  return safeNextPath(typeof raw === "string" ? raw : null);
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
    : [{ mvola: "", rib: "", other: "" }, EMPTY_DIAGNOSTIC];
  const defaults = workspace
    ? {
        name: workspace.name,
        trade: workspace.trade ?? "",
        address: workspace.address ?? "",
        default_currency: workspace.default_currency,
        nif: "",
        stat: "",
        tax_regime: "",
        ...manual,
      }
    : EMPTY_PROFILE;
  // Changer de langue garde la page demandée avant la connexion (?next=).
  const back = next ? `/demarrage?next=${encodeURIComponent(next)}` : "/demarrage";
  return (
    <Shell controls={<AccountControls locale={locale} back={back} />}>
      <OnboardingForm locale={locale} defaults={defaults} diagnostic={diagnostic} next={next} />
    </Shell>
  );
}
