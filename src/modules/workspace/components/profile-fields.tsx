"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { FieldErrors } from "@/lib/forms";
import { CURRENCIES } from "@/lib/money";
import { LogoField } from "./logo-field";

export type ProfileDefaults = {
  name: string;
  trade: string;
  address: string;
  default_currency: string;
  nif: string;
  stat: string;
  tax_regime: string;
  mvola: string;
  rib: string;
};

export const EMPTY_PROFILE: ProfileDefaults = {
  name: "",
  trade: "",
  address: "",
  default_currency: "MGA",
  nif: "",
  stat: "",
  tax_regime: "",
  mvola: "",
  rib: "",
};

// Champs du profil pro (accueil guidé et Réglages). Le métier peut être piloté par le
// parent (accueil guidé : déjà saisi à l'étape 1).
export function ProfileFields({
  defaults,
  errors = {},
  logoUrl = null,
  logoKey,
  trade,
}: {
  defaults: ProfileDefaults;
  errors?: FieldErrors;
  logoUrl?: string | null;
  logoKey?: number;
  trade?: { value: string; onChange: (value: string) => void };
}) {
  const t = useTranslations("Profile");
  const tErrors = useTranslations("FormErrors");
  const error = (field: string) => (errors[field] ? tErrors(errors[field]) : undefined);

  return (
    <div className="flex flex-col gap-5">
      <Field id="name" label={t("businessName.label")} hint={t("businessName.hint")} error={error("name")}>
        {(c) => <Input {...c} name="name" autoComplete="organization" defaultValue={defaults.name} maxLength={200} />}
      </Field>
      <Field id="trade" label={t("trade.label")} error={error("trade")}>
        {(c) =>
          trade ? (
            <Input {...c} name="trade" value={trade.value} onChange={(e) => trade.onChange(e.target.value)} maxLength={200} />
          ) : (
            <Input {...c} name="trade" defaultValue={defaults.trade} maxLength={200} />
          )
        }
      </Field>
      <LogoField key={logoKey} currentUrl={logoUrl} businessName={defaults.name} error={errors.logo} />
      <Field id="address" label={t("address.label")} hint={t("address.hint")} error={error("address")}>
        {(c) => <Input {...c} name="address" autoComplete="street-address" defaultValue={defaults.address} maxLength={500} />}
      </Field>
      <Field id="default_currency" label={t("currency.label")} hint={t("currency.hint")} error={error("default_currency")}>
        {(c) => (
          <Select {...c} name="default_currency" defaultValue={defaults.default_currency}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {t(`currency.${currency}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="nif" label={t("nif.label")} hint={t("nif.hint")} error={error("nif")}>
        {(c) => <Input {...c} name="nif" inputMode="numeric" autoComplete="off" defaultValue={defaults.nif} maxLength={20} />}
      </Field>
      <Field id="stat" label={t("stat.label")} hint={t("stat.hint")} error={error("stat")}>
        {(c) => <Input {...c} name="stat" inputMode="numeric" autoComplete="off" defaultValue={defaults.stat} maxLength={30} />}
      </Field>
      <Field id="tax_regime" label={t("taxRegime.label")} hint={t("taxRegime.hint")} error={error("tax_regime")}>
        {(c) => (
          <Select {...c} name="tax_regime" defaultValue={defaults.tax_regime}>
            <option value="" disabled>
              {t("choose")}
            </option>
            <option value="impot_synthetique">{t("taxRegime.impot_synthetique")}</option>
            <option value="tva">{t("taxRegime.tva")}</option>
          </Select>
        )}
      </Field>

      <fieldset className="flex flex-col gap-5 rounded-card border border-sand bg-sand-light p-4">
        <legend className="px-1 text-base font-bold text-lagoon">{t("manual.title")}</legend>
        <p className="-mt-2 text-sm text-ink-muted">{t("manual.intro")}</p>
        <Field id="mvola" label={t("mvola.label")} hint={t("mvola.hint")} error={error("mvola")}>
          {(c) => <Input {...c} name="mvola" type="tel" inputMode="tel" autoComplete="tel" defaultValue={defaults.mvola} maxLength={20} />}
        </Field>
        <Field id="rib" label={t("rib.label")} hint={t("rib.hint")} error={error("rib")}>
          {(c) => <Input {...c} name="rib" inputMode="numeric" autoComplete="off" defaultValue={defaults.rib} maxLength={40} />}
        </Field>
      </fieldset>
    </div>
  );
}
