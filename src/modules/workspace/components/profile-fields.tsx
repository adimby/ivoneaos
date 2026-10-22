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
  other: string;
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
  other: "",
};

// Champs du profil pro (accueil guidé et Réglages). Le métier peut être piloté par le
// parent (accueil guidé : déjà saisi à l'étape 1).
export function ProfileFields({
  defaults,
  errors = {},
  logoUrl = null,
  logoKey,
  trade,
  fiscal = false,
  fiscalRequired = false,
  fiscalStatus,
}: {
  defaults: ProfileDefaults;
  errors?: FieldErrors;
  logoUrl?: string | null;
  logoKey?: number;
  trade?: { value: string; onChange: (value: string) => void };
  // Données fiscales (Réglages) ; l'accueil guidé ne les demande pas.
  fiscal?: boolean;
  // Données fiscales déjà complètes : corrigeables, plus effaçables.
  fiscalRequired?: boolean;
  // État de la vérification de la carte fiscale (avertissement avant de changer NIF ou STAT).
  fiscalStatus?: string;
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
      {fiscal && (
        <fieldset id="infos-fiscales" className="flex scroll-mt-20 flex-col gap-5">
          <legend className="mb-1 text-base font-bold text-lagoon">{t("fiscal.title")}</legend>
          <p className="-mt-2 text-sm text-ink-muted">{t(fiscalRequired ? "fiscal.requiredHint" : "fiscal.optionalHint")}</p>
          <FiscalFields defaults={defaults} error={error} fiscalStatus={fiscalStatus} />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-5 rounded-card border border-sand bg-sand-light p-4">
        <legend className="px-1 text-base font-bold text-lagoon">{t("manual.title")}</legend>
        <p className="-mt-2 text-sm text-ink-muted">{t("manual.intro")}</p>
        <Field id="mvola" label={t("mvola.label")} hint={t("mvola.hint")} error={error("mvola")}>
          {(c) => <Input {...c} name="mvola" type="tel" inputMode="tel" autoComplete="tel" defaultValue={defaults.mvola} maxLength={20} />}
        </Field>
        <Field id="rib" label={t("rib.label")} hint={t("rib.hint")} error={error("rib")}>
          {(c) => <Input {...c} name="rib" inputMode="numeric" autoComplete="off" defaultValue={defaults.rib} maxLength={40} />}
        </Field>
        <Field id="other" label={t("otherPayment.label")} hint={t("otherPayment.hint")} error={error("other")}>
          {(c) => <Input {...c} name="other" autoComplete="off" defaultValue={defaults.other} maxLength={300} />}
        </Field>
      </fieldset>
    </div>
  );
}

// NIF, STAT et régime fiscal (Réglages et bloc « Avant ta première facture »). Carte
// vérifiée ou en cours de vérification : chaque numéro prévient qu'une modification annule
// la vérification (déclencheur t15_fiscal_guard).
export function FiscalFields({
  defaults,
  error,
  fiscalStatus,
}: {
  defaults: Pick<ProfileDefaults, "nif" | "stat" | "tax_regime">;
  error: (field: string) => string | undefined;
  fiscalStatus?: string;
}) {
  const t = useTranslations("Profile");
  const warning =
    fiscalStatus === "verified" || fiscalStatus === "pending" ? (
      <span className="mt-1 block font-semibold text-ink" data-testid="fiscal-reset-warning">
        {t(`fiscal.resetWarning.${fiscalStatus}`)}
      </span>
    ) : null;
  return (
    <>
      <Field
        id="nif"
        label={t("nif.label")}
        hint={
          <>
            {t("nif.hint")}
            {warning}
          </>
        }
        error={error("nif")}
      >
        {(c) => <Input {...c} name="nif" inputMode="numeric" autoComplete="off" defaultValue={defaults.nif} maxLength={20} />}
      </Field>
      <Field
        id="stat"
        label={t("stat.label")}
        hint={
          <>
            {t("stat.hint")}
            {warning}
          </>
        }
        error={error("stat")}
      >
        {(c) => <Input {...c} name="stat" inputMode="numeric" autoComplete="off" defaultValue={defaults.stat} maxLength={30} />}
      </Field>
      <Field id="tax_regime" label={t("taxRegime.label")} hint={t("taxRegime.hint")} error={error("tax_regime")}>
        {(c) => (
          <Select {...c} name="tax_regime" defaultValue={defaults.tax_regime}>
            <option value="">{t("choose")}</option>
            <option value="impot_synthetique">{t("taxRegime.impot_synthetique")}</option>
            <option value="tva">{t("taxRegime.tva")}</option>
          </Select>
        )}
      </Field>
    </>
  );
}
