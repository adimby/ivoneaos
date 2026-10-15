import type { ReactNode } from "react";

// Cadre des pages publiques (/p/[token]) : bandeau, contenu centré, mention Ivonea OS et
// action principale collée en bas de l'écran. Server Component, sans JavaScript.
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
        <div className="px-safe mx-auto flex h-11 w-full max-w-md items-center justify-end">
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
      <main className="px-safe mx-auto flex w-full max-w-md flex-1 flex-col gap-5 pt-5 pb-safe">
        {children}
        <p className="pb-4 text-center text-xs text-ink-muted">{madeWith}</p>
        {bottom}
      </main>
    </div>
  );
}
