import type { ReactNode } from "react";
import { Brand } from "../brand";

// Page hors coquille (erreur, page introuvable) : en-tête Deep Lagoon et contenu centré.
export function PlainPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="on-dark bg-lagoon pt-safe text-white">
        <div className="px-safe mx-auto flex h-14 w-full max-w-md items-center">
          <Brand />
        </div>
      </header>
      <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col pt-6 pb-safe">{children}</main>
    </div>
  );
}
