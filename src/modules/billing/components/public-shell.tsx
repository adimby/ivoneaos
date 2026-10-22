import type { ReactNode } from "react";

// Cadre des pages publiques (/p/[token]) : bandeau, contenu centré, mention Ivonea OS et
// action principale collée en bas de l'écran. Server Component, sans JavaScript.
// Tablette et ordinateur : colonne de document plus large (672 px), centrée ; l'action
// reste collée en bas de cette colonne, pas en travers de l'écran.
export function PublicShell({
  children,
  madeWith,
  languageLink,
  bottom,
}: {
  children: ReactNode;
  madeWith: string;
  bottom?: ReactNode;
  languageLink?: { href: string; label: string; lang: string };
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="on-dark bg-lagoon pt-safe text-white">
        <div className="px-safe mx-auto flex h-11 w-full max-w-md items-center justify-end md:max-w-2xl md:px-8">
          {languageLink && (
            <a
              href={languageLink.href}
              hrefLang={languageLink.lang}
              lang={languageLink.lang}
              className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline"
            >
              {languageLink.label}
            </a>
          )}
        </div>
      </div>
      <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col gap-5 pt-5 pb-safe md:max-w-2xl md:gap-6 md:px-8 md:pt-10">
        {children}
        <p className="pb-4 text-center text-xs text-ink-muted">{madeWith}</p>
        {bottom}
      </main>
    </div>
  );
}
