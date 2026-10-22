"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { BottomBar } from "@/components/ui/bottom-bar";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveAppearance } from "../actions";
import type { Appearance } from "../preference";
import { PALETTE_COLORS, PALETTES, THEME_MODES, type Palette, type ThemeMode } from "../themes";

declare global {
  interface Window {
    __ivnApplyAppearance?: (mode: ThemeMode, palette: Palette) => void;
  }
}

const option =
  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-sand-strong bg-surface p-3 " +
  "has-checked:border-lagoon has-checked:ring-2 has-checked:ring-lagoon " +
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lagoon";

// Réglages > Apparence. Formulaire natif (fonctionne sans JavaScript : la page rechargée
// relit le cookie). Avec JavaScript, l'apparence ne s'applique qu'une fois enregistrée
// (saved, retour ?r=ok) : un échec laisse l'apparence d'avant, celle du profil.
export function AppearanceForm({ locale, current, saved }: { locale: string; current: Appearance; saved: boolean }) {
  const t = useTranslations("Appearance");
  useEffect(() => {
    if (saved) window.__ivnApplyAppearance?.(current.mode, current.palette);
  }, [saved, current.mode, current.palette]);
  return (
    <form action={saveAppearance} className="flex flex-1 flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-lg font-bold text-lagoon">{t("mode.legend")}</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {THEME_MODES.map((mode) => (
            <label key={mode} className={option}>
              <input type="radio" name="mode" value={mode} defaultChecked={current.mode === mode} className="size-5 accent-lagoon" />
              <ModeIcon mode={mode} />
              <span className="flex flex-col">
                <span className="text-base font-semibold text-ink">{t(`mode.${mode}`)}</span>
                <span className="text-sm text-ink-muted">{t(`mode.${mode}Hint`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2" aria-describedby="palette-hint">
        <legend className="mb-1 text-lg font-bold text-lagoon">{t("palette.legend")}</legend>
        <p id="palette-hint" className="mb-1 text-sm text-ink-muted">
          {t("palette.hint")}
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {PALETTES.map((palette) => {
            const { light, dark } = PALETTE_COLORS[palette];
            return (
              <label key={palette} className={option} data-testid={`palette-${palette}`}>
                <input type="radio" name="palette" value={palette} defaultChecked={current.palette === palette} className="size-5 accent-lagoon" />
                <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded-lg border border-sand">
                  {[light.chrome, light.terracotta, light.turquoise, dark.spray].map((color, i) => (
                    <span key={i} className="block h-8 w-3.5" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="text-base font-semibold text-ink">{t(`palette.${palette}`)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <BottomBar>
        <SubmitButton block>{t("save")}</SubmitButton>
      </BottomBar>
    </form>
  );
}

function ModeIcon({ mode }: { mode: ThemeMode }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-turquoise" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {mode === "light" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </>
      )}
      {mode === "dark" && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" strokeLinejoin="round" />}
      {mode === "auto" && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
