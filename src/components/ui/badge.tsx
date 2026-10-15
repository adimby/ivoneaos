import type { ComponentProps } from "react";
import { cn } from "./cn";

type Tone = "accent" | "neutral" | "success" | "danger";

const tones: Record<Tone, string> = {
  // Turquoise : texte ink (4,5:1), jamais blanc.
  accent: "bg-turquoise text-ink",
  neutral: "bg-spray text-ink",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "accent", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}
