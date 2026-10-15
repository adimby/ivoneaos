import { NextIntlClientProvider } from "next-intl";

// Catalogue complet pour les formulaires client de cette page (la racine n'envoie que Errors).
export default function Layout({ children }: LayoutProps<"/[locale]/connexion">) {
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
