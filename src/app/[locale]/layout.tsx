import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
  };
}

// viewport-fit=cover : l'en-tête et la barre d'onglets gèrent les zones sûres (encoche).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#01515a",
};

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Composants client hors application : seulement la page d'erreur (Errors). Les
  // segments qui en ont besoin (application, connexion, accueil guidé) reçoivent tout le
  // catalogue par leur propre provider ; la page publique /p/[token] n'en reçoit rien.
  const { Errors } = await getMessages({ locale });

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-spray text-ink">
        <NextIntlClientProvider messages={{ Errors }}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
