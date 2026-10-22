import type { ComponentProps } from "react";
import { cn } from "./cn";

export const fieldControl =
  "block min-h-12 w-full rounded-xl border border-sand-strong bg-surface px-4 text-base text-ink " +
  "placeholder:text-ink-muted/70 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger " +
  "disabled:bg-sand-light";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldControl, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldControl, "py-3", className)} {...props} />;
}
