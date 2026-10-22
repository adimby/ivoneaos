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
import { brandSnapshot, DEFAULT_BRAND, parseBrand } from "@/modules/branding/brand";
import { OnboardingWizard } from "@/modules/onboarding/components/onboarding-wizard";
import { PromisePanel } from "@/modules/onboarding/components/promise-panel";
import { EMPTY_DIAGNOSTIC } from "@/modules/onboarding/diagnostic-fields";
import { getOnboardingAnswers } from "@/modules/onboarding/queries";
import { resumeStep } from "@/modules/onboarding/steps";
import { fiscalDefaults } from "@/modules/workspace/profile-schema";
import { getCurrentWorkspace, getLogoUrl } from "@/modules/workspace/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/demarrage">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("metaTitle") };
}

// Démarrage en 3 étapes (P1) : activité, profil et marque (ouvre l'application),
// administratif (facultatif, « Plus tard »). Reprise à la bonne étape après un
// rechargement ou une nouvelle connexion (src/modules/onboarding/steps.ts).
type Props = PageProps<"/[locale]/demarrage">;

export default async function OnboardingPage({ params, searchParams }: Props) {
  const locale = (await params).locale as Locale;
  // Une seule frontière : l'en-tête (langue, déconnexion) apparaît avec le contenu. Un
  // en-tête rendu à part pouvait s'afficher plus tard que le contenu, et son remplaçant
  // provisoire (sans ?next) changeait la langue en perdant la page demandée.
  return (
    <Suspense
      fallback={
        <Shell controls={null} promise={<PromisePanelPlaceholder />}>
          <PageSkeleton />
        </Shell>
      }
    >
      <Onboarding locale={locale} searchParams={searchParams} />
    </Suspense>
  );
}

function Shell({ controls, promise, children }: { controls: ReactNode; promise: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="on-dark bg-chrome pt-safe text-on-chrome">
        {/* Langue et déconnexion : possibles avant la fin du démarrage (mauvais compte, langue). */}
        <div className="px-safe mx-auto flex h-14 w-full max-w-md items-center justify-between gap-2 md:max-w-3xl md:px-8 lg:max-w-none">
          <Brand />
          {controls}
        </div>
      </header>
      {/* Téléphone : une colonne. Tablette : carte centrée. Ordinateur : deux panneaux, la
          promesse à gauche, le formulaire à droite. */}
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {promise}
        <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col pt-5 md:max-w-3xl md:px-8 md:py-10 lg:max-w-4xl lg:px-12 lg:py-14 xl:px-16">
          <div className="flex flex-1 flex-col md:flex-none md:rounded-card md:border md:border-sand/70 md:bg-surface md:p-8 md:shadow-card lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Attente : panneau gauche vide, au même fond que la promesse (pas de saut sur ordinateur).
function PromisePanelPlaceholder() {
  return <aside aria-hidden="true" className="hidden border-r border-sand/70 bg-sand-light lg:block" />;
}

async function readNext(searchParams: Props["searchParams"]) {
  const raw = (await searchParams).next;
  return safeNextPath(typeof raw === "string" ? raw : null);
}

// Erreur d'un envoi classique (avant le JavaScript, src/modules/onboarding/actions.ts) :
// une clé connue seulement (FormErrors.check_answers ou errors.db.*).
async function readError(searchParams: Props["searchParams"], locale: Locale) {
  const raw = (await searchParams).erreur;
  if (raw === "check_answers") return raw;
  if (typeof raw !== "string" || !/^[a-z_]+$/.test(raw)) return undefined;
  const t = await getTranslations({ locale, namespace: "errors.db" });
  return t.has(raw) ? raw : undefined;
}

async function Onboarding({ locale, searchParams }: { locale: Locale; searchParams: Props["searchParams"] }) {
  await requireUserId(locale);
  // Page demandée avant la connexion : on y va une fois le démarrage terminé.
  const next = await readNext(searchParams);
  const initialError = await readError(searchParams, locale);
  const workspace = await getCurrentWorkspace();
  const answers = workspace ? await getOnboardingAnswers(workspace.id) : null;
  const step = resumeStep(workspace, answers);
  if (step === "done") return redirect({ href: next ?? "/tableau-de-bord", locale });

  const onboarded = Boolean(workspace?.onboarded_at);
  const brand = workspace ? parseBrand(brandSnapshot(workspace)) : DEFAULT_BRAND;
  const logoUrl = await getLogoUrl(workspace?.logo_path ?? null);
  // Changer de langue garde la page demandée avant la connexion (?next=).
  const back = next ? `/demarrage?next=${encodeURIComponent(next)}` : "/demarrage";
  return (
    <Shell controls={<AccountControls locale={locale} back={back} />} promise={<PromisePanel locale={locale} />}>
      <OnboardingWizard
        locale={locale}
        next={next}
        initialStep={step}
        initialError={initialError}
        workspaceId={workspace?.id ?? null}
        activity={{ trade: workspace?.trade ?? "", ...(answers?.diagnostic ?? EMPTY_DIAGNOSTIC) }}
        profile={{
          // Avant l'étape 2, le nom du workspace n'est que le métier (nom provisoire) : vide.
          name: onboarded ? (workspace?.name ?? "") : "",
          address: workspace?.address ?? "",
          default_currency: workspace?.default_currency ?? "MGA",
        }}
        logoUrl={logoUrl}
        brand={{ primary: brand.primary, accent: brand.accent, font: brand.font }}
        fiscal={workspace ? fiscalDefaults(workspace) : { nif: "", stat: "", tax_regime: "" }}
        fiscalStatus={workspace?.fiscal_status ?? "unverified"}
        fiscalRejectionReason={workspace?.fiscal_rejection_reason ?? null}
        sampleYear={new Date().getFullYear()}
      />
    </Shell>
  );
}
