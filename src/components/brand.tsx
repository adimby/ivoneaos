import { cn } from "./ui/cn";

// Marque : vague stylisée (océan) + nom. Couleur héritée (currentColor).
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-bold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="9" className="fill-turquoise" />
        <path
          d="M6 18c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3M6 23c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"
          fill="none"
          className="stroke-on-turquoise"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="10" r="3" fill="#f4f1ea" />
      </svg>
      Ivonea OS
    </span>
  );
}
