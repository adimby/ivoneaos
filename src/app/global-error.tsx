"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { NextIntlClientProvider, useTranslations, type AbstractIntlMessages } from "next-intl";
import { routing } from "@/i18n/routing";
import "./globals.css";

// Dernier recours : erreur dans la mise en page racine ([locale]/layout). Remplace tout
// le document, hors du fournisseur next-intl : les textes (langue de l'URL) sont chargés
// ici, seulement quand l'erreur survient.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const params = useParams<{ locale?: string }>();
  const locale = routing.locales.find((l) => l === params?.locale) ?? routing.defaultLocale;
  const [messages, setMessages] = useState<AbstractIntlMessages | null>(null);

  useEffect(() => {
    console.error(error);
  }, [error]);
  useEffect(() => {
    import(`../../messages/${locale}.json`).then((m) => setMessages(m.default));
  }, [locale]);

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col bg-spray text-ink">
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4" role="alert">
          {messages && (
            <NextIntlClientProvider locale={locale} messages={messages}>
              <GlobalErrorContent retry={retry} />
            </NextIntlClientProvider>
          )}
        </main>
      </body>
    </html>
  );
}

function GlobalErrorContent({ retry }: { retry: () => void }) {
  const t = useTranslations("Errors");
  return (
    <>
      <h1 className="text-2xl font-bold text-lagoon">{t("title")}</h1>
      <p className="text-base">{t("body")}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-11 rounded-xl bg-terracotta px-5 text-base font-semibold text-on-terracotta"
      >
        {t("retry")}
      </button>
    </>
  );
}
