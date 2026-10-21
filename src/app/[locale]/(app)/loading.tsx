import { PageSkeleton } from "@/components/app-shell/page-skeleton";

// Navigation entre écrans : squelette affiché tout de suite (préchargé avec les liens),
// la coquille et la barre d'onglets restent en place pendant le chargement des données.
export default function Loading() {
  return <PageSkeleton />;
}
