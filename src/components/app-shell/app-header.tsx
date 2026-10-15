import { Link } from "@/i18n/navigation";
import { Brand } from "../brand";

// En-tête Deep Lagoon, zone sûre du haut (encoche) comprise.
export function AppHeader() {
  return (
    <header className="on-dark sticky top-0 z-10 bg-lagoon pt-safe text-white">
      <div className="px-safe mx-auto flex h-14 w-full max-w-md items-center">
        <Link href="/tableau-de-bord" className="rounded-lg">
          <Brand />
        </Link>
      </div>
    </header>
  );
}
