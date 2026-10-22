import { Suspense, type ReactNode } from "react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import { SideNav } from "@/components/app-shell/side-nav";
import { Brand } from "@/components/brand";
import type { Locale } from "@/i18n/routing";
import { requireWorkspace } from "@/modules/workspace/queries";

// En-tête statique affiché tout de suite. La navigation et le contenu attendent la
// vérification de la session et de l'accueil guidé : une personne pas encore accueillie
// est redirigée vers /demarrage sans voir les onglets (redirection par en-tête HTTP, ou
// balise meta refresh si la page a commencé à s'afficher : pas besoin de JavaScript).
// Mise en page selon la largeur, en CSS seulement (aucune détection en JavaScript) :
// - téléphone (< md) : colonne de 448 px, en-tête en haut, barre d'onglets en bas ;
// - tablette (md à lg) : contenu plus large (768 px), onglets toujours en bas (tablette
//   tenue en main, tactile) ;
// - ordinateur (lg et plus) : navigation fixe à gauche, contenu jusqu'à 1152 px, ni
//   en-tête ni barre d'onglets (display: none).
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  // Catalogue complet pour les formulaires et composants client de l'application.
  return (
    <NextIntlClientProvider>
      <div className="flex min-h-dvh flex-col">
        <SkipLink />
        <AppHeader />
        <Suspense fallback={<ShellFallback />}>
          <OnboardedGate locale={locale as Locale}>{children}</OnboardedGate>
        </Suspense>
      </div>
    </NextIntlClientProvider>
  );
}

// flex : une barre d'action (BottomBar) descend en bas de l'écran même si la page est courte.
// Marge du bas réservée à la barre d'onglets : téléphone et tablette seulement.
const mainClass =
  "px-safe mx-auto flex w-full max-w-md flex-1 flex-col pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] " +
  "outline-none md:max-w-3xl md:px-8 md:pt-8 lg:max-w-6xl lg:px-10 lg:pt-10 lg:pb-12";
// Ordinateur : place de la navigation de gauche (w-64).
const contentClass = "flex flex-1 flex-col lg:pl-64";
const MAIN_ID = "contenu";

// Lien d'évitement : premier élément atteint au clavier, visible au focus seulement.
function SkipLink() {
  const t = useTranslations("Nav");
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only rounded-xl bg-white px-4 py-3 font-semibold text-lagoon shadow-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      {t("skip")}
    </a>
  );
}

function ShellFallback() {
  return (
    <>
      {/* Emplacements de la navigation (mêmes dimensions) : pas de saut à l'affichage. */}
      <div aria-hidden="true" className="on-dark fixed inset-y-0 left-0 z-20 hidden w-64 bg-lagoon px-6 pt-6 text-white lg:block">
        <Brand />
      </div>
      <div className={contentClass}>
        <main id={MAIN_ID} tabIndex={-1} className={mainClass}>
          <PageSkeleton />
        </main>
      </div>
      <div aria-hidden="true" className="fixed inset-x-0 bottom-0 z-20 bg-lagoon pb-safe lg:hidden">
        <div className="h-16" />
      </div>
    </>
  );
}

async function OnboardedGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  await requireWorkspace(locale);
  return (
    <>
      <SideNav locale={locale} />
      <div className={contentClass}>
        <main id={MAIN_ID} tabIndex={-1} className={mainClass}>
          {children}
        </main>
      </div>
      <BottomNav locale={locale} />
    </>
  );
}
