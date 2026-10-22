import type { CSSProperties, ReactNode } from "react";
import { brandColors, FONT_FAMILIES, type Brand } from "@/modules/branding/brand";

// Cadre des pages publiques (/p/[token]) : bandeau, contenu centré, mention Ivonea OS et
// action principale collée en bas de l'écran. Server Component, sans JavaScript.
// Tablette et ordinateur : colonne de document plus large (672 px), centrée ; l'action
// reste collée en bas de cette colonne, pas en travers de l'écran.
// Toujours en Océan clair (data-palette, data-mode), jamais au thème de l'application de
// qui l'ouvre ; à l'image de marque du document s'il y en a une : couleur principale pour
// le bandeau, les titres et le focus, accent pour le bouton du client, police du document.
export function PublicShell({
  children,
  madeWith,
  languageLink,
  bottom,
  brand,
}: {
  children: ReactNode;
  madeWith: string;
  bottom?: ReactNode;
  languageLink?: { href: string; label: string; lang: string };
  brand?: Brand;
}) {
  return (
    <div data-palette="ocean" data-mode="light" className="flex min-h-dvh flex-col bg-spray text-ink" style={brand && brandStyle(brand)}>
      <div className="on-dark bg-chrome pt-safe text-on-chrome">
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

// Jetons de l'application remplacés par la marque (mêmes règles que le PDF : couleur
// principale lisible sur fond clair, texte blanc ou noir sur les aplats).
function brandStyle(brand: Brand): CSSProperties {
  const { primary, onPrimary, accent, onAccent, accentEdge } = brandColors(brand);
  return {
    "--color-lagoon": primary,
    "--color-on-lagoon": onPrimary,
    "--color-chrome": primary,
    "--color-on-chrome": onPrimary,
    "--color-on-chrome-muted": onPrimary,
    "--color-terracotta": accent,
    "--color-terracotta-dark": accent,
    "--color-on-terracotta": onAccent,
    "--color-terracotta-edge": accentEdge ?? "transparent",
    fontFamily: FONT_FAMILIES[brand.font].css,
  } as CSSProperties;
}
