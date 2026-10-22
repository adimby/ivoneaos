import { NextIntlClientProvider } from "next-intl";
import { AppearanceFromCookie } from "@/modules/appearance/components/appearance-from-cookie";
import { AppearanceNoScript } from "@/modules/appearance/components/appearance-sync";

// Catalogue complet pour les formulaires client de cette page (la racine n'envoie que Errors).
export default function Layout({ children }: LayoutProps<"/[locale]/connexion">) {
  return (
    <NextIntlClientProvider>
      <AppearanceNoScript />
      <AppearanceFromCookie />
      {children}
    </NextIntlClientProvider>
  );
}
