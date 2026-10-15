import type { ComponentProps } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-busy:cursor-progress";

const variants: Record<Variant, string> = {
  // Terracotta : bouton principal, texte blanc (5,0:1).
  primary: "bg-terracotta text-white shadow-sm hover:bg-terracotta-dark active:bg-terracotta-dark",
  secondary:
    "border-2 border-lagoon bg-white text-lagoon hover:bg-sand-light active:bg-sand-light",
  ghost: "text-lagoon underline-offset-4 hover:underline",
  // Action destructive discrète (archiver) : texte danger (6,2:1 sur spray).
  danger: "text-danger underline-offset-4 hover:underline",
};

export function buttonClasses(variant: Variant = "primary", block = false, className?: string) {
  return cn(base, variants[variant], block && "w-full", className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; block?: boolean };

export function Button({ variant = "primary", block, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, block, className)} {...props} />;
}
