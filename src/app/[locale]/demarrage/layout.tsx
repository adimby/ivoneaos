import { NextIntlClientProvider } from "next-intl";

// Catalogue complet pour les formulaires client de cette page (la racine n'envoie que Errors).
export default function Layout({ children }: LayoutProps<"/[locale]/demarrage">) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
