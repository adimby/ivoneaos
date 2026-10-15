import type { ReactNode } from "react";
import { cn } from "./cn";

// Message d'état annoncé aux lecteurs d'écran (erreur : alert, succès : status).
export function Alert({ tone, children, className }: { tone: "error" | "success"; children: ReactNode; className?: string }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-sm font-medium",
        tone === "error" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
        className,
      )}
    >
      {children}
    </p>
  );
}
