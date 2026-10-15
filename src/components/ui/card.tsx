import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-card border border-sand/70 bg-sand-light p-4 shadow-card", className)}
      {...props}
    />
  );
}
