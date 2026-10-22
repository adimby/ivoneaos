import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { APPEARANCE_SCRIPT } from "@/modules/appearance/preference";
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
// themeColor : Océan clair ; le script d'apparence la remplace par celle de la palette.
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

  // Apparence (Réglages > Apparence) : posée sur <html> avant la première peinture par un
  // script qui lit le cookie ivn_apparence (src/modules/appearance/preference.ts). Lire le
  // cookie ici, côté serveur, rendrait toute l'application dynamique (plus de coquille
  // statique, Cache Components) ; le script garde les pages rapides sans éclair de thème.
  // suppressHydrationWarning : React garde les attributs posés par le script.
  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-spray text-ink">
        <NextIntlClientProvider messages={{ Errors }}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
