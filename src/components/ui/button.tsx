import type { ComponentProps } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-base font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress";

const variants: Record<Variant, string> = {
  // Terracotta : bouton principal, texte on-terracotta (blanc, 5,0:1 en Océan). Contour
  // terracotta-edge : invisible, sauf accent de marque trop pâle (page client).
  primary:
    "bg-terracotta text-on-terracotta shadow-sm ring-2 ring-terracotta-edge ring-inset hover:bg-terracotta-dark active:bg-terracotta-dark",
  secondary:
    "border-2 border-lagoon bg-surface text-lagoon hover:bg-sand-light active:bg-sand-light",
  ghost: "text-lagoon underline-offset-4 hover:underline",
  // Action destructive discrète (archiver) : texte danger (6,2:1 sur spray).
  danger: "text-danger underline-offset-4 hover:underline",
};

// Marge intérieure par défaut, sauf si className en donne une sans variante (p-*, px-*,
// ps-*, pe-*, pl-*, pr-*) : deux classes de marge ne se départagent pas selon leur ordre
// dans l'attribut mais dans la feuille CSS (px-5 l'emportait sur p-0, px-0 et px-3). Une
// marge à variante (sm:px-3) n'entre pas en conflit : la règle de la variante vient après.
const HAS_PADDING_X = /(^|\s)(p|px|ps|pe|pl|pr)-/;

export function buttonClasses(variant: Variant = "primary", block = false, className?: string) {
  return cn(base, !HAS_PADDING_X.test(className ?? "") && "px-5", variants[variant], block && "w-full", className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; block?: boolean };

export function Button({ variant = "primary", block, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, block, className)} {...props} />;
}
