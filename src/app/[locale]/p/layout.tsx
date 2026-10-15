import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// Titre par défaut des pages publiques : celui de la page 404 (not-found.tsx ne peut pas
// définir de métadonnées, et celles d'une page qui appelle notFound() sont ignorées).
// La page d'un document remplace ce titre. Jamais indexées.
export async function generateMetadata({ params }: LayoutProps<"/[locale]/p">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Public" });
  return { title: t("notFound.title"), robots: { index: false, follow: false } };
}

export default function Layout({ children }: LayoutProps<"/[locale]/p">) {
  return children;
}
