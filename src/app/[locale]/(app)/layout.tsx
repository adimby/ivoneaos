import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/app-shell/app-header";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { PageSkeleton } from "@/components/app-shell/page-skeleton";
import type { Locale } from "@/i18n/routing";
import { requireWorkspace } from "@/modules/workspace/queries";

// En-tête statique affiché tout de suite. La barre d'onglets et le contenu attendent la
// vérification de la session et de l'accueil guidé : une personne pas encore accueillie
// est redirigée vers /demarrage sans voir les onglets (redirection par en-tête HTTP, ou
// balise meta refresh si la page a commencé à s'afficher : pas besoin de JavaScript).
export default async function AppLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <Suspense fallback={<ShellFallback />}>
        <OnboardedGate locale={locale as Locale}>{children}</OnboardedGate>
      </Suspense>
    </div>
  );
}

const mainClass = "px-safe mx-auto w-full max-w-md flex-1 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))]";

function ShellFallback() {
  return (
    <>
      <main className={mainClass}>
        <PageSkeleton />
      </main>
      {/* Emplacement de la barre d'onglets (même hauteur) : pas de saut à l'affichage. */}
      <div aria-hidden="true" className="fixed inset-x-0 bottom-0 z-20 bg-lagoon pb-safe">
        <div className="h-16" />
      </div>
    </>
  );
}

async function OnboardedGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  await requireWorkspace(locale);
  return (
    <>
      <main className={mainClass}>{children}</main>
      <BottomNav locale={locale} />
    </>
  );
}
