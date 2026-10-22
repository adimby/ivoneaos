"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/cn";
import { useHydrated } from "@/lib/use-hydrated";
import { BRAND_FONTS, COLOR_PRESETS, DEFAULT_BRAND, FONT_FAMILIES, isReadablePrimary, normalizeHex, type BrandFont } from "../brand";
import { BrandPreview, ColorField, option } from "./branding-form";

// Image de marque essentielle (démarrage) : associations prêtes, couleur principale et
// d'accent, police, avec l'aperçu d'un devis qui suit les choix. Mêmes règles que
// Réglages > Image de marque (principale lisible sur fond clair, contrôle navigateur et
// serveur). Champs envoyés avec le formulaire : primary_color, accent_color, font.
export function BrandEssentials({
  defaults,
  errors = {},
  businessName,
  logoUrl,
  sampleYear,
}: {
  defaults: { primary: string; accent: string; font: BrandFont };
  errors?: Record<string, string>;
  businessName: string;
  logoUrl: string | null;
  sampleYear: number;
}) {
  const t = useTranslations("Branding");
  const tErrors = useTranslations("FormErrors");
  const hydrated = useHydrated();
  const [primary, setPrimary] = useState(defaults.primary);
  const [accent, setAccent] = useState(defaults.accent);
  const [font, setFont] = useState<BrandFont>(defaults.font);

  const primaryHex = normalizeHex(primary);
  const accentHex = normalizeHex(accent);
  const primaryProblem = !primaryHex ? "color_format" : !isReadablePrimary(primaryHex) ? "primary_contrast" : null;
  const error = (field: string) => (errors[field] ? tErrors(errors[field]) : undefined);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink">{t("colors.presets")}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
            {COLOR_PRESETS.map((preset) => {
              const active = primaryHex === preset.primary && accentHex === preset.accent;
              return (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={active}
                  data-testid={`brand-preset-${preset.key}`}
                  onClick={() => {
                    setPrimary(preset.primary);
                    setAccent(preset.accent);
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-sand-strong bg-surface px-3 text-base font-semibold text-ink aria-pressed:border-lagoon aria-pressed:ring-2 aria-pressed:ring-lagoon"
                >
                  <span aria-hidden="true" className="flex overflow-hidden rounded-md border border-sand">
                    <span className="block size-5" style={{ backgroundColor: preset.primary }} />
                    <span className="block size-5" style={{ backgroundColor: preset.accent }} />
                  </span>
                  {t(`colors.${preset.key}`)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
          <ColorField
            id="primary_color"
            label={t("colors.primary")}
            hint={t("colors.primaryHint")}
            pickerLabel={t("colors.picker")}
            value={primary}
            onChange={setPrimary}
            error={primaryProblem && hydrated ? tErrors(primaryProblem) : error("primary_color")}
          />
          <ColorField
            id="accent_color"
            label={t("colors.accent")}
            hint={t("colors.accentHint")}
            pickerLabel={t("colors.picker")}
            value={accent}
            onChange={setAccent}
            error={!accentHex && hydrated ? tErrors("color_format") : error("accent_color")}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-ink">{t("font.legend")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
            {BRAND_FONTS.map((value) => (
              <label key={value} className={cn(option, "min-h-11")} data-testid={`brand-font-${value}`}>
                <input
                  type="radio"
                  name="font"
                  value={value}
                  checked={font === value}
                  onChange={() => setFont(value)}
                  className="size-5 shrink-0 accent-lagoon"
                />
                <span className="text-base font-semibold text-ink" style={{ fontFamily: FONT_FAMILIES[value].css }}>
                  {t(`font.${value}`)}
                </span>
              </label>
            ))}
          </div>
          {error("font") && <p className="text-sm font-medium text-danger">{error("font")}</p>}
        </fieldset>
      </div>

      <div className="flex flex-col gap-2 xl:sticky xl:top-6">
        <p className="text-sm font-semibold text-ink">{t("preview.title")}</p>
        <BrandPreview
          businessName={businessName}
          logoUrl={logoUrl}
          logoSize={DEFAULT_BRAND.logoSize}
          logoPosition={DEFAULT_BRAND.logoPosition}
          bannerUrl={null}
          primary={primaryHex && !primaryProblem ? primaryHex : defaults.primary}
          accent={accentHex ?? defaults.accent}
          font={font}
          sampleYear={sampleYear}
        />
      </div>
    </div>
  );
}
