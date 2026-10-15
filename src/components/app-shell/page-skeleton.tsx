import { useTranslations } from "next-intl";

// Attente du contenu (session, données) : la coquille est déjà affichée.
export function PageSkeleton() {
  const t = useTranslations("Common");
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-sand/60" />
      <div className="h-40 animate-pulse rounded-card bg-sand/40" />
      <div className="h-24 animate-pulse rounded-card bg-sand/40" />
    </div>
  );
}
