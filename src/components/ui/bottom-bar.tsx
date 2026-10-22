import type { ReactNode } from "react";
import { cn } from "./cn";

const base =
  "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-auto flex flex-col gap-3 border-t border-sand/70 bg-spray/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8";

const layouts = {
  // Tablette : boutons à droite, à leur taille. Ordinateur : plus de barre collée en bas
  // (rien ne flotte sur 1440 px), les actions suivent le contenu, alignées à droite.
  inline:
    "md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-x-4 md:*:w-auto " +
    "lg:static lg:mx-0 lg:mt-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none",
  // Ordinateur : encadré collé en haut de la colonne de droite (totaux et bouton d'un
  // formulaire en deux colonnes), visible pendant la saisie.
  aside:
    "lg:sticky lg:top-10 lg:bottom-auto lg:mx-0 lg:mt-0 lg:rounded-card lg:border lg:border-sand/70 lg:bg-sand-light lg:p-4 lg:shadow-card lg:backdrop-blur-none",
};

// Action principale de l'écran, en bas, à portée du pouce : collée au-dessus de la barre
// d'onglets pendant le défilement, en bas de l'écran si la page est courte. À placer en
// dernier enfant du conteneur de la page (ou du formulaire), qui porte flex-1.
export function BottomBar({
  children,
  className,
  layout = "inline",
}: {
  children: ReactNode;
  className?: string;
  layout?: keyof typeof layouts;
}) {
  return <div className={cn(base, layouts[layout], className)}>{children}</div>;
}
