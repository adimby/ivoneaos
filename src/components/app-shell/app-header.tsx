import { Link } from "@/i18n/navigation";
import { Brand } from "../brand";

// En-tête Deep Lagoon, zone sûre du haut (encoche) comprise. Ordinateur (lg) : masqué, la
// marque est en haut de la navigation de gauche.
export function AppHeader() {
  return (
    <header className="on-dark sticky top-0 z-10 bg-lagoon pt-safe text-white lg:hidden">
      <div className="px-safe mx-auto flex h-14 w-full max-w-md items-center md:max-w-3xl md:px-8">
        <Link href="/tableau-de-bord" className="rounded-lg">
          <Brand />
        </Link>
      </div>
    </header>
  );
}
