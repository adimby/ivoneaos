"use client";

import { startTransition, useActionState, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PlusIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { BottomBar } from "@/components/ui/bottom-bar";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { CURRENCIES, formatMoney, lineTotal, parseAmountInput, type Currency } from "@/lib/money";
import { useFocusFirstInvalid } from "@/lib/use-focus-invalid";
import { useHydrated } from "@/lib/use-hydrated";
import { formErrorMessage } from "@/modules/workspace/components/profile-form";
import { saveInvoice, saveQuote, type DocumentFormState } from "../actions";
import { MAX_LINES } from "../schemas";
import { computeTotals, inDefaultCurrency, parseQuantityInput, parseRateInput } from "../totals";

export type LineDraft = { description: string; quantity: string; unitPrice: string };

export type DocumentDefaults = {
  id?: string;
  contact_id: string;
  deal_id?: string;
  currency: Currency;
  language: "fr" | "en";
  // Validité (devis) ou échéance (facture), AAAA-MM-JJ.
  date: string;
  discount: string;
  exchange_rate: string;
  lines: LineDraft[];
};

const SYMBOL: Record<Currency, string> = { MGA: "Ar", EUR: "€", USD: "$" };
const EMPTY_LINE: LineDraft = { description: "", quantity: "1", unitPrice: "" };

// Devis ou facture : client, devise, langue, lignes (ajout et retrait en un geste),
// remise, validité ou échéance, taux de change (facture dans une autre devise que la
// devise principale). Total recalculé à chaque saisie, comme la base le calculera.
export function DocumentForm({
  kind,
  defaults,
  back,
  contacts,
  contactsTotal,
  fixedContact,
  defaultCurrency,
  minDate,
  sentWarning = false,
}: {
  kind: "quote" | "invoice";
  defaults: DocumentDefaults;
  back: string;
  contacts: { id: string; label: string }[];
  contactsTotal?: number;
  // Client imposé (opportunité, ou document déjà enregistré) : affiché en lecture seule.
  fixedContact?: { label: string; hint: string };
  defaultCurrency: Currency;
  minDate: string;
  sentWarning?: boolean;
}) {
  const t = useTranslations("Billing.form");
  const tAll = useTranslations();
  const locale = useLocale();
  const hydrated = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<DocumentFormState, FormData>(
    kind === "quote" ? saveQuote : saveInvoice,
    {},
  );
  useFocusFirstInvalid(formRef, state);
  const errors = state.fieldErrors ?? {};
  const error = (field: string) => (errors[field] ? tAll(`FormErrors.${errors[field]}`) : undefined);

  // Lignes de départ : celles du document, ou une ligne vide (clés 0..n-1, la suivante à n).
  const initialLines = defaults.lines.length ? defaults.lines : [EMPTY_LINE];
  const nextKey = useRef(initialLines.length);
  const [lines, setLines] = useState(() => initialLines.map((line, i) => ({ ...line, key: i })));
  const [currency, setCurrency] = useState<Currency>(defaults.currency);
  const [discount, setDiscount] = useState(defaults.discount);
  const [rate, setRate] = useState(defaults.exchange_rate);
  const linesTitleId = useId();

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const addLine = () => {
    const key = nextKey.current++;
    setLines((current) => [...current, { ...EMPTY_LINE, key }]);
    // Focus sur la description de la nouvelle ligne, une fois affichée.
    requestAnimationFrame(() => document.getElementById(`line-${key}-description`)?.focus());
  };
  const removeLine = (key: number) => setLines((current) => current.filter((line) => line.key !== key));

  // Totaux en direct : seules les lignes complètes et valides comptent.
  const priced = lines.map((line) => {
    const quantity = parseQuantityInput(line.quantity);
    const price = parseAmountInput(line.unitPrice, currency);
    return quantity.ok && price.ok ? { quantity: quantity.value, unit_price: price.minor } : null;
  });
  const discountMinor = (() => {
    const parsed = parseAmountInput(discount, currency);
    return parsed.ok ? parsed.minor : 0;
  })();
  const totals = computeTotals(
    priced.filter((p) => p !== null),
    discountMinor,
  );
  // Montant hors plage (saisie démesurée) : « — » plutôt qu'une erreur d'affichage.
  const money = (amount: number) => (Number.isSafeInteger(amount) ? formatMoney(amount, currency, locale) : "—");
  const needsRate = kind === "invoice" && currency !== defaultCurrency;
  const parsedRate = parseRateInput(rate);
  const converted = (() => {
    if (!needsRate || !parsedRate || totals.tooLarge) return null;
    try {
      return inDefaultCurrency(totals.total, currency, defaultCurrency, parsedRate);
    } catch {
      return null; // conversion hors plage : rien à afficher
    }
  })();

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="flex flex-1 flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.deal_id && <input type="hidden" name="deal_id" value={defaults.deal_id} />}

      {sentWarning && (
        <p role="note" className="rounded-xl bg-turquoise-soft px-4 py-3 text-sm font-medium text-ink">
          {t("sentWarning")}
        </p>
      )}

      {fixedContact ? (
        <Field id="contact_id" label={t("client.label")} hint={fixedContact.hint}>
          {(c) => (
            <>
              <input type="hidden" name="contact_id" value={defaults.contact_id} />
              <Input {...c} value={fixedContact.label} readOnly />
            </>
          )}
        </Field>
      ) : (
        <Field
          id="contact_id"
          label={t("client.label")}
          hint={
            contactsTotal !== undefined && contactsTotal > contacts.length
              ? t("client.truncated", { shown: contacts.length, total: contactsTotal })
              : undefined
          }
          error={error("contact_id")}
        >
          {(c) => (
            <Select {...c} name="contact_id" defaultValue={defaults.contact_id} required>
              <option value="" disabled>
                {tAll("Profile.choose")}
              </option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field id="currency" label={t("currency.label")} error={error("currency")}>
          {(c) => (
            <Select {...c} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} ({SYMBOL[code]})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="language" label={t("language.label")}>
          {(c) => (
            <Select {...c} name="language" defaultValue={defaults.language}>
              <option value="fr">{t("languages.fr")}</option>
              <option value="en">{t("languages.en")}</option>
            </Select>
          )}
        </Field>
      </div>

      <section aria-labelledby={linesTitleId} className="flex flex-col gap-3">
        <h2 id={linesTitleId} className="text-lg font-bold text-lagoon">
          {t("lines.title")}
        </h2>
        {errors.lines && <Alert tone="error">{tAll(`FormErrors.${errors.lines}`)}</Alert>}
        <ol className="flex flex-col gap-3">
          {lines.map((line, index) => {
            const id = `line-${line.key}`;
            const p = priced[index];
            return (
              <li key={line.key} data-testid="line" className="rounded-card border border-sand/70 bg-white p-3 shadow-card">
                <fieldset aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span id={`${id}-title`} className="text-sm font-bold text-lagoon">
                      {t("lines.line", { n: index + 1 })}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        aria-label={t("lines.remove", { n: index + 1 })}
                        className="-my-1 -mr-1 inline-flex size-11 items-center justify-center rounded-xl text-ink-muted hover:bg-sand-light hover:text-danger"
                      >
                        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <Field id={`${id}-description`} label={t("lines.description")} error={error(`line_${index}_description`)}>
                    {(c) => (
                      <Input
                        {...c}
                        name="line_description"
                        value={line.description}
                        onChange={(e) => update(line.key, { description: e.target.value })}
                        placeholder={t("lines.descriptionHint")}
                        maxLength={2000}
                        autoComplete="off"
                      />
                    )}
                  </Field>
                  <div className="grid grid-cols-[5.5rem_1fr] gap-3">
                    <Field id={`${id}-quantity`} label={t("lines.quantity")} error={error(`line_${index}_quantity`)}>
                      {(c) => (
                        <Input
                          {...c}
                          name="line_quantity"
                          inputMode="decimal"
                          autoComplete="off"
                          value={line.quantity}
                          onChange={(e) => update(line.key, { quantity: e.target.value })}
                          maxLength={12}
                        />
                      )}
                    </Field>
                    <Field id={`${id}-price`} label={`${t("lines.unitPrice")} (${SYMBOL[currency]})`} error={error(`line_${index}_unit_price`)}>
                      {(c) => (
                        <Input
                          {...c}
                          name="line_unit_price"
                          inputMode="decimal"
                          autoComplete="off"
                          value={line.unitPrice}
                          onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                          maxLength={24}
                        />
                      )}
                    </Field>
                  </div>
                  <p className="flex justify-between text-sm text-ink-muted">
                    <span>{t("lines.lineTotal")}</span>
                    <output htmlFor={`${id}-quantity ${id}-price`} className="font-semibold text-ink">
                      {p ? money(lineTotal(p.quantity, p.unit_price)) : "—"}
                    </output>
                  </p>
                </fieldset>
              </li>
            );
          })}
        </ol>
        {lines.length < MAX_LINES && (
          <Button variant="secondary" block onClick={addLine} disabled={!hydrated}>
            <PlusIcon className="size-5" />
            {t("lines.add")}
          </Button>
        )}
      </section>

      <Field id="discount" label={`${t("discount.label")} (${SYMBOL[currency]})`} hint={t("discount.hint")} error={error("discount")}>
        {(c) => (
          <Input {...c} name="discount" inputMode="decimal" autoComplete="off" value={discount} onChange={(e) => setDiscount(e.target.value)} maxLength={24} />
        )}
      </Field>

      {kind === "quote" ? (
        <Field id="valid_until" label={t("validUntil.label")} hint={t("validUntil.hint")} error={error("valid_until")}>
          {(c) => <Input {...c} name="valid_until" type="date" min={minDate} defaultValue={defaults.date} required />}
        </Field>
      ) : (
        <Field id="due_on" label={t("dueOn.label")} error={error("due_on")}>
          {(c) => <Input {...c} name="due_on" type="date" min={minDate} defaultValue={defaults.date} required />}
        </Field>
      )}

      {needsRate && (
        <Field
          id="exchange_rate"
          label={t("rate.label", { default: defaultCurrency })}
          hint={
            <>
              {t("rate.hint", { currency, default: defaultCurrency })}
              {converted !== null && <> {t("rate.converted", { amount: formatMoney(converted, defaultCurrency, locale) })}</>}
            </>
          }
          error={error("exchange_rate")}
        >
          {(c) => (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-base font-semibold text-ink">1 {SYMBOL[currency]} =</span>
              <Input {...c} name="exchange_rate" inputMode="decimal" autoComplete="off" value={rate} onChange={(e) => setRate(e.target.value)} maxLength={20} />
              <span className="shrink-0 text-base font-semibold text-ink">{SYMBOL[defaultCurrency]}</span>
            </div>
          )}
        </Field>
      )}

      <BottomBar>
        <div aria-live="polite">
          {state.formError && !pending && <Alert tone="error">{formErrorMessage(tAll, state.formError)}</Alert>}
        </div>
        <dl className="flex flex-col gap-0.5 text-sm" data-testid="form-totals">
          {discountMinor > 0 && (
            <>
              <div className="flex justify-between text-ink-muted">
                <dt>{t("subtotal")}</dt>
                <dd>{money(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>{t("discountLine")}</dt>
                <dd>− {money(discountMinor)}</dd>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between text-lg font-bold text-ink">
            <dt>{t("total")}</dt>
            <dd data-testid="form-total" aria-live="polite">
              {money(totals.total)}
            </dd>
          </div>
        </dl>
        <SubmitButton pending={pending} disabled={!hydrated} block>
          {defaults.id ? t("save") : t("create")}
        </SubmitButton>
      </BottomBar>
    </form>
  );
}
