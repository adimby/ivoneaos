import type { ReactNode } from "react";
import { cn } from "./cn";

// Message d'état annoncé aux lecteurs d'écran (erreur : alert, succès ou information : status).
const TONES = {
  error: "bg-danger-soft text-danger",
  success: "bg-success-soft text-success",
  info: "bg-turquoise-soft text-ink",
} as const;

export function Alert({ tone, children, className }: { tone: keyof typeof TONES; children: ReactNode; className?: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-sm font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
