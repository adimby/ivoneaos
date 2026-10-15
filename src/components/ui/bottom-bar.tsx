import type { ReactNode } from "react";
import { cn } from "./cn";

// Action principale de l'écran, en bas, à portée du pouce : collée au-dessus de la barre
// d'onglets pendant le défilement, en bas de l'écran si la page est courte. À placer en
// dernier enfant du conteneur de la page (ou du formulaire), qui porte flex-1.
export function BottomBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-auto flex flex-col gap-3 border-t border-sand/70 bg-spray/95 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}
