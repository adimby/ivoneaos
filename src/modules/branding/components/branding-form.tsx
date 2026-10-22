"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import { readableTextOn } from "@/lib/contrast";
import { formatMoney } from "@/lib/money";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { saveBranding, type BrandingFormState } from "../actions";
import { BANNER_ACCEPT, checkBannerFile } from "../banner";
import {
  accentContrast,
  BRAND_FONTS,
  COLOR_PRESETS,
  FONT_FAMILIES,
  isReadablePrimary,
  LOGO_POSITIONS,
  LOGO_SIZES,
  LOGO_WEB_SIZE,
  normalizeHex,
  type Brand,
  type BrandFont,
  type LogoPosition,
  type LogoSize,
} from "../brand";

const option =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-sand-strong bg-surface px-3 py-2 " +
  "has-checked:border-lagoon has-checked:ring-2 has-checked:ring-lagoon " +
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lagoon";
const legend = "mb-2 text-lg font-bold text-lagoon";

export type BrandingDefaults = Brand & { footer: string };

// Réglages > Image de marque : choix enregistrés au niveau du workspace, aperçu en direct
// (page client et PDF suivent les mêmes règles de couleurs et de police).
export function BrandingForm({
  locale,
  defaults,
  logoUrl,
  logoIsWebp,
  bannerUrl,
  businessName,
  sampleYear,
}: {
  locale: string;
  defaults: BrandingDefaults;
  logoUrl: string | null;
  logoIsWebp: boolean;
  bannerUrl: string | null;
  businessName: string;
  sampleYear: number;
}) {
  const t = useTranslations("Branding");
  const tErrors = useTranslations("FormErrors");
  const tAll = useTranslations();
  const [state, formAction, pending] = useActionState<BrandingFormState, FormData>(saveBranding, {});
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  const [showLogo, setShowLogo] = useState(defaults.showLogo);
  const [logoSize, setLogoSize] = useState<LogoSize>(defaults.logoSize);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(defaults.logoPosition);
  const [primary, setPrimary] = useState(defaults.primary);
  const [accent, setAccent] = useState(defaults.accent);
  const [font, setFont] = useState<BrandFont>(defaults.font);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  useEffect(() => () => {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
  }, [bannerPreview]);

  // Enregistrement réussi : la bannière envoyée est désormais celle du serveur (bannerUrl,
  // rendue à nouveau avec la réponse) ; l'aperçu local s'efface et « Retirer » redevient
  // possible sans recharger la page.
  const [seenSavedAt, setSeenSavedAt] = useState(state.savedAt);
  if (state.savedAt !== seenSavedAt) {
    setSeenSavedAt(state.savedAt);
    setBannerPreview(null);
    setRemoveBanner(false);
  }

  const error = (field: string) => (state.fieldErrors?.[field] ? tErrors(state.fieldErrors[field]) : undefined);
  const primaryHex = normalizeHex(primary);
  const accentHex = normalizeHex(accent);
  // Contrôle immédiat (le serveur revérifie) : couleur principale lisible sur les fonds clairs.
  const primaryProblem = !primaryHex ? "color_format" : !isReadablePrimary(primaryHex) ? "primary_contrast" : null;
  const shownBanner = bannerPreview ?? (removeBanner ? null : bannerUrl);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-1 flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-10"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className={legend}>{t("logo.legend")}</legend>
          {logoUrl ? (
            <label className={option}>
              <input
                type="checkbox"
                name="show_logo"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.currentTarget.checked)}
                className="size-5 accent-lagoon"
              />
              <span className="text-base font-semibold text-ink">{t("logo.show")}</span>
            </label>
          ) : (
            <p className="text-base text-ink-muted">
              {t("logo.none")}{" "}
              <Link href="/reglages" className="font-semibold text-lagoon underline underline-offset-4">
                {t("logo.addInProfile")}
              </Link>
              {/* Pas de logo : le choix reste enregistré pour le jour où il sera ajouté. */}
              <input type="hidden" name="show_logo" value={showLogo ? "on" : ""} />
            </p>
          )}
          {logoIsWebp && <Alert tone="info">{t("logo.webp")}</Alert>}
          <RadioRow
            name="logo_size"
            label={t("logo.size")}
            values={LOGO_SIZES}
            value={logoSize}
            onChange={setLogoSize}
            text={(v) => t(`logo.${v}`)}
          />
          <RadioRow
            name="logo_position"
            label={t("logo.position")}
            values={LOGO_POSITIONS}
            value={logoPosition}
            onChange={setLogoPosition}
            text={(v) => t(`logo.${v}`)}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className={legend}>{t("banner.legend")}</legend>
          <Field id="banner" label={<span className="sr-only">{t("banner.legend")}</span>} hint={t("banner.hint")} error={bannerError ? tErrors(bannerError) : error("banner")}>
            {(control) => (
              <div className="flex flex-col gap-3">
                {shownBanner && (
                  // URL signée du bucket privé ou aperçu local (blob:) : pas de next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shownBanner} alt={t("banner.alt")} className="aspect-[4/1] w-full rounded-xl border border-sand object-cover" />
                )}
                <input
                  {...control}
                  key={state.savedAt}
                  type="file"
                  name="banner"
                  accept={BANNER_ACCEPT}
                  className="peer sr-only"
                  data-testid="banner-input"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    setBannerPreview(null);
                    setBannerError(null);
                    if (!file) return;
                    const problem = checkBannerFile(file);
                    if (problem) {
                      setBannerError(problem);
                      event.currentTarget.value = "";
                      return;
                    }
                    setRemoveBanner(false);
                    setBannerPreview(URL.createObjectURL(file));
                  }}
                />
                <label
                  htmlFor={control.id}
                  className={buttonClasses(
                    "secondary",
                    false,
                    "cursor-pointer self-start peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lagoon",
                  )}
                >
                  {shownBanner ? t("banner.change") : t("banner.choose")}
                </label>
              </div>
            )}
          </Field>
          {bannerUrl && !bannerPreview && (
            <label className={option}>
              <input
                type="checkbox"
                name="remove_banner"
                checked={removeBanner}
                onChange={(e) => setRemoveBanner(e.currentTarget.checked)}
                className="size-5 accent-lagoon"
              />
              <span className="text-base font-semibold text-ink">{t("banner.remove")}</span>
            </label>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className={legend}>{t("colors.legend")}</legend>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">{t("colors.presets")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-sand-strong bg-surface px-3 text-base font-semibold text-ink aria-pressed:border-lagoon aria-pressed:ring-2 aria-pressed:ring-lagoon"
                  >
                    <span aria-hidden="true" className="flex overflow-hidden rounded-md border border-sand">
                      <span className="block size-6" style={{ backgroundColor: preset.primary }} />
                      <span className="block size-6" style={{ backgroundColor: preset.accent }} />
                    </span>
                    {t(`colors.${preset.key}`)}
                  </button>
                );
              })}
            </div>
          </div>
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
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className={legend}>{t("font.legend")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {BRAND_FONTS.map((value) => (
              <label key={value} className={option} data-testid={`brand-font-${value}`}>
                <input
                  type="radio"
                  name="font"
                  value={value}
                  checked={font === value}
                  onChange={() => setFont(value)}
                  className="size-5 accent-lagoon"
                />
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-ink">{t(`font.${value}`)}</span>
                  <span className="text-lg text-ink-muted" style={{ fontFamily: FONT_FAMILIES[value].css }}>
                    {t("font.sample", { amount: formatMoney(450000, "MGA", locale) })}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field id="invoice_footer" label={t("footer.label")} hint={t("footer.hint")} error={error("invoice_footer")}>
          {(control) => <Textarea {...control} name="invoice_footer" rows={2} maxLength={300} defaultValue={defaults.footer} />}
        </Field>
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-10">
        <h2 className="text-lg font-bold text-lagoon">{t("preview.title")}</h2>
        <p className="text-sm text-ink-muted">{t("preview.hint")}</p>
        <BrandPreview
          businessName={businessName}
          logoUrl={showLogo ? logoUrl : null}
          logoSize={logoSize}
          logoPosition={logoPosition}
          bannerUrl={shownBanner}
          primary={primaryHex && !primaryProblem ? primaryHex : defaults.primary}
          accent={accentHex ?? defaults.accent}
          font={font}
          sampleYear={sampleYear}
        />
        <a href={`/${locale}/reglages/image-de-marque/apercu`} target="_blank" rel="noopener" className={buttonClasses("secondary", true)} data-testid="brand-pdf">
          {t("preview.pdf")}
        </a>
      </div>

      <BottomBar className="lg:col-span-2">
        <div aria-live="polite" className="md:basis-full">
          {state.formError && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
          {state.status === "saved" && !pending && <Alert tone="success">{t("saved")}</Alert>}
        </div>
        <SubmitButton pending={pending} disabled={!hydrated} block>
          {t("save")}
        </SubmitButton>
      </BottomBar>
    </form>
  );
}

function RadioRow<T extends string>({
  name,
  label,
  values,
  value,
  onChange,
  text,
}: {
  name: string;
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  text: (value: T) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <label key={v} className={cn(option, "min-h-11 flex-1 justify-center")}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="size-5 accent-lagoon" />
            <span className="text-base font-semibold text-ink">{text(v)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ColorField({
  id,
  label,
  hint,
  pickerLabel,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  pickerLabel: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const hex = normalizeHex(value);
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(control) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} · ${pickerLabel}`}
            value={(hex ?? "#000000").toLowerCase()}
            onChange={(e) => onChange(e.currentTarget.value.toUpperCase())}
            className="h-12 w-14 shrink-0 cursor-pointer rounded-xl border border-sand-strong bg-surface p-1"
          />
          <Input
            {...control}
            name={id}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            onBlur={() => hex && onChange(hex)}
            autoComplete="off"
            spellCheck={false}
            maxLength={7}
            inputMode="text"
            className="font-mono uppercase"
          />
        </div>
      )}
    </Field>
  );
}

// Aperçu en direct, à l'échelle d'un téléphone : mêmes règles que le PDF et la page client
// (texte blanc ou noir sur les aplats, police et position du logo).
export function BrandPreview({
  businessName,
  logoUrl,
  logoSize,
  logoPosition,
  bannerUrl,
  primary,
  accent,
  font,
  sampleYear,
}: {
  businessName: string;
  logoUrl: string | null;
  logoSize: LogoSize;
  logoPosition: LogoPosition;
  bannerUrl: string | null;
  primary: string;
  accent: string;
  font: BrandFont;
  sampleYear: number;
}) {
  const t = useTranslations("Branding.preview");
  const tColumns = useTranslations("Pdf.columns");
  const locale = useLocale();
  const money = (amount: number) => formatMoney(amount, "MGA", locale);
  // Même règle que le PDF : contour à la couleur principale si l'accent est trop pâle.
  const accentEdge = accentContrast(accent) < 3 ? `inset 0 0 0 1px ${primary}` : undefined;
  const size = Math.round(LOGO_WEB_SIZE[logoSize] * 0.7);
  const style: CSSProperties = { fontFamily: FONT_FAMILIES[font].css };
  const centered = logoPosition === "center";
  return (
    <div
      aria-hidden="true"
      data-testid="brand-preview"
      className="overflow-hidden rounded-card border border-sand bg-white text-[#0b2a2e] shadow-card"
      style={style}
    >
      {bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bannerUrl} alt="" className="aspect-[4/1] w-full object-cover" />
      ) : (
        <div className="h-1.5" style={{ backgroundColor: primary }} />
      )}
      <div className="flex flex-col gap-3 p-4">
        <div className={cn("flex gap-2", centered ? "flex-col items-center text-center" : "items-center")}>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ height: size, maxWidth: size * 3 }} className="object-contain" />
          )}
          <span className="text-base font-bold" style={{ color: primary }}>
            {businessName}
          </span>
        </div>
        <p className="text-xl font-bold tracking-wide uppercase" style={{ color: primary }}>
          {t("document")} D-{sampleYear}-0001
        </p>
        <p className="border-l-4 bg-[#f4f1ea] px-2 py-1 text-sm" style={{ borderColor: accent }}>
          {t("client")} · Rakoto
        </p>
        <div className="text-sm">
          {/* Tableau comme le PDF : en-tête sur la couleur principale, ligne sur fond blanc. */}
          <div className="flex justify-between px-2 py-1 text-xs font-bold" style={{ backgroundColor: primary, color: readableTextOn(primary) }}>
            <span>{tColumns("description")}</span>
            <span>{tColumns("total")}</span>
          </div>
          <div className="flex justify-between border-b border-[#c9c5ba] bg-white px-2 py-1.5">
            <span>{t("line")}</span>
            <span>{money(450000)}</span>
          </div>
          <div className="mt-2 flex justify-between px-2 py-1 font-bold" style={{ backgroundColor: primary, color: readableTextOn(primary) }}>
            <span>{t("total")}</span>
            <span>{money(450000)}</span>
          </div>
          <div
            className="mt-1 flex justify-between px-2 py-1 font-bold"
            style={{ backgroundColor: accent, color: readableTextOn(accent), boxShadow: accentEdge }}
          >
            <span>{t("due")}</span>
            <span>{money(200000)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
