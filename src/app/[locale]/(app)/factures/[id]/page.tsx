import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appOrigin } from "@/lib/app-url";
import { formatMoney } from "@/lib/money";
import { localDate } from "@/lib/time";
import { cancelInvoice, deleteDraft, markInvoicePaid, sendInvoice } from "@/modules/billing/actions";
import { ConfirmAction } from "@/modules/billing/components/confirm-action";
import { DocumentLines } from "@/modules/billing/components/document-lines";
import { Notices } from "@/modules/billing/components/notices";
import { SharePanel } from "@/modules/billing/components/share-panel";
import { StatusBadge } from "@/modules/billing/components/status-badge";
import { documentEmail, shareMessage } from "@/modules/billing/email";
import { getInvoice, getQuoteNumber } from "@/modules/billing/queries";
import { appDocument } from "@/modules/billing/render";
import { mailtoUrl, publicPath, whatsappShareUrl } from "@/modules/billing/share";
import { invoiceDisplayStatus } from "@/modules/billing/status";
import { inDefaultCurrency } from "@/modules/billing/totals";
import { formatDay } from "@/modules/billing/view";
import { getContact } from "@/modules/crm/queries";
import { PAPI_MIN_AMOUNT } from "@/modules/payments/papi/adapter";
import { getInvoicePaymentLinks, getOnlinePayments, getPapiAccount } from "@/modules/payments/queries";
import { FiscalVerificationPanel } from "@/modules/verification/components/fiscal-verification-panel";
import { getFiscalState } from "@/modules/verification/queries";
import { FiscalInfoBlock } from "@/modules/workspace/components/fiscal-info-block";
import { fiscalDefaults, hasFiscalInfo } from "@/modules/workspace/profile-schema";
import { getCurrentWorkspace, getManualPayment, requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/factures/[id]">;

// Titre de l'onglet : numéro du document une fois émis (lecture mise en cache, partagée
// avec la page), sinon « (brouillon) » ; titre neutre si le document est introuvable.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Billing" });
  const workspace = await getCurrentWorkspace();
  const doc = workspace ? await getInvoice(workspace.id, id) : null;
  if (!doc) return { title: t("invoiceMetaTitle") };
  return { title: doc.number ? t("invoiceTitle", { number: doc.number }) : t("invoiceDraftTitle") };
}

const METHODS = ["manual", "MVOLA", "ORANGE_MONEY", "AIRTEL_MONEY"] as const;

// Facture : statut (« en retard » d'après l'échéance), client, lignes et total, taux vers
// la devise principale ; envoi, partage, « Marquer payée » (paiement manuel), annulation.
// Ordinateur : document à gauche (en-tête, lignes, aperçu), partage à droite ; dessous, une
// ligne d'actions (secondaires à gauche, principale à droite). Ordre de lecture et de
// focus ligne par ligne, le même que sur téléphone.
export default async function InvoicePage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const invoice = await getInvoice(workspace.id, id);
  if (!invoice) notFound();
  const query = await searchParams;
  const today = localDate(new Date());
  const status = invoiceDisplayStatus(invoice.status, invoice.due_on, today);

  const open = invoice.status === "sent" || invoice.status === "overdue";
  const [contact, quoteNumber, onlinePayments, papiAccount, paymentLinks, manual, t, tShare, tVerification] = await Promise.all([
    getContact(workspace.id, invoice.contact_id),
    invoice.quote_id ? getQuoteNumber(workspace.id, invoice.quote_id) : null,
    invoice.status === "paid" || invoice.status === "cancelled" ? getOnlinePayments(workspace.id, invoice.id) : null,
    open ? getPapiAccount(workspace.id) : null,
    invoice.status === "draft" ? null : getInvoicePaymentLinks(workspace.id, invoice.id),
    typeof query.papi === "string" ? getManualPayment(workspace.id) : null,
    getTranslations({ locale, namespace: "Billing" }),
    getTranslations({ locale: invoice.language, namespace: "Share" }),
    getTranslations({ locale, namespace: "Verification" }),
  ]);
  const fields = { locale, id: invoice.id, back: `/factures/${invoice.id}` };
  const hidden = Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
  const money = (amount: number) => formatMoney(amount, invoice.currency, locale);
  const due = invoice.total - invoice.amount_paid;
  const papiEligible = invoice.currency === "MGA" && due >= PAPI_MIN_AMOUNT;
  // Lien Papi déjà envoyé : il reste payable chez Papi même si la facture est réglée
  // autrement ou annulée ici (Papi ne permet pas de le désactiver).
  const papiLinkWarning = paymentLinks?.papiPayable ? ` ${t("detail.papiLinkStillPayable")}` : "";
  const onlinePayment = invoice.status === "paid" ? onlinePayments?.[0] : undefined;
  // Facture annulée : seuls les paiements en ligne (lien Papi envoyé avant l'annulation) sont
  // signalés, pas un paiement direct enregistré avant d'annuler.
  const paidWhileCancelled = invoice.status === "cancelled" ? (onlinePayments ?? []).reduce((sum, p) => sum + p.amount, 0) : 0;

  // Autre devise que la devise principale : montant converti au taux saisi.
  const foreign = invoice.currency !== workspace.default_currency;
  const converted = foreign ? inDefaultCurrency(invoice.total, invoice.currency, workspace.default_currency, invoice.exchange_rate) : null;
  const rateText = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(invoice.exchange_rate);

  let share = null;
  if (invoice.status !== "draft") {
    const doc = await appDocument(workspace, { type: "invoice", ...invoice });
    if (doc) {
      const path = publicPath(invoice.language, invoice.public_token);
      const url = `${await appOrigin()}${path}`;
      const email = documentEmail(doc, url, tShare);
      share = {
        url,
        pdfUrl: `${path}/pdf?telecharger`,
        whatsappUrl: whatsappShareUrl(contact?.phone, shareMessage(doc, url, tShare)),
        mailtoUrl: mailtoUrl(contact?.email, email.subject, email.text),
      };
    }
  }

  // Brouillon sans NIF, STAT ou régime fiscal : la base refuserait l'envoi. Le bloc « Avant
  // ta première facture » prend la place du bouton d'envoi, qui revient une fois enregistré.
  const fiscalMissing = invoice.status === "draft" && !hasFiscalInfo(workspace);
  // Carte fiscale pas encore vérifiée : 3 factures au plus. Plafond atteint : le dépôt des
  // photos (ou l'attente de la vérification) prend la place du bouton d'envoi.
  const fiscal = invoice.status === "draft" && !fiscalMissing ? await getFiscalState(workspace) : null;
  const sendBlocked = fiscal?.left === 0;
  let main = null;
  if (invoice.status === "draft" && !fiscalMissing && !sendBlocked) {
    main = (
      <form action={sendInvoice} className="flex flex-col gap-2">
        {hidden}
        <p className="text-sm text-ink-muted">{t("detail.sendInvoiceHint")}</p>
        <SubmitButton block>
          {t("detail.sendInvoice")}
          <ArrowRightIcon className="size-5" />
        </SubmitButton>
      </form>
    );
  } else if (fiscal && sendBlocked && (fiscal.status === "unverified" || fiscal.status === "rejected")) {
    // Plafond atteint : l'action principale (sous le pouce) mène au dépôt des photos.
    main = (
      <a href="#verification-fiscale" className={buttonClasses("primary", true)} data-testid="fiscal-goto-upload">
        {tVerification("goUpload")}
      </a>
    );
  } else if ((invoice.status === "sent" || invoice.status === "overdue") && due > 0) {
    main = (
      <ConfirmAction
        action={markInvoicePaid}
        fields={fields}
        label={t("detail.markPaid")}
        variant="primary"
        block
        title={t("paid.title")}
        body={t("paid.body", { amount: money(due) }) + papiLinkWarning}
        confirmLabel={t("paid.ok")}
        cancelLabel={t("paid.cancel")}
      >
        <Field id="method" label={t("paid.method")}>
          {(c) => (
            <Select {...c} name="method" defaultValue={invoice.currency === "MGA" ? "MVOLA" : "manual"}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`paid.methods.${m}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </ConfirmAction>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:content-start lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <Link href="/factures" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
          ← {t("backToList")}
        </Link>
        {/* Refus « infos fiscales manquantes » ou « carte à vérifier » périmé une fois le bloc
            enregistré ou la carte vérifiée (l'URL le garde). */}
        <Notices
          query={
            (!fiscalMissing && query.erreur === "workspace_tax_info_missing") ||
            (!sendBlocked && typeof query.erreur === "string" && query.erreur.startsWith("fiscal_verification_"))
              ? { ...query, erreur: undefined }
              : query
          }
          manualPayment={manual ? Boolean(manual.mvola || manual.rib || manual.other) : undefined} />
        {invoice.status === "paid" && invoice.number && (
          <Alert tone="success">
            <span className="block text-base font-bold" data-testid="paid-notice">
              {t("detail.paidNotice", { number: invoice.number, amount: money(invoice.amount_paid) })}
            </span>
            {onlinePayment && (
              <span className="block">
                {onlinePayment.method === "manual"
                  ? t("detail.paidOnlineAny")
                  : t("detail.paidOnline", { method: t(`paid.methods.${onlinePayment.method}`) })}
              </span>
            )}
          </Alert>
        )}
        {invoice.status === "paid" && invoice.amount_paid > invoice.total && (
          <Alert tone="error">
            <span data-testid="overpaid-notice">{t("detail.overpaid", { amount: money(invoice.amount_paid - invoice.total) })}</span>
          </Alert>
        )}
        {paidWhileCancelled > 0 && (
          <Alert tone="error">
            <span data-testid="paid-while-cancelled">{t("detail.paidWhileCancelled", { amount: money(paidWhileCancelled) })}</span>
          </Alert>
        )}
        {paymentLinks?.issues.map((issue) => (
          <Alert key={issue.reference} tone="error">
            <span data-testid={`${issue.provider}-issue`}>{t(`detail.${issue.provider}Issue.${issue.error}`, { reference: issue.reference })}</span>
          </Alert>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <StatusBadge kind="invoice" status={status} className="self-start" />
          <h1 className="text-2xl font-bold break-words text-lagoon">
            {invoice.number ? t("invoiceTitle", { number: invoice.number }) : t("invoiceDraftTitle")}
          </h1>
          <p className="text-xl font-bold text-ink" data-testid="document-total">
            {money(invoice.total)}
          </p>
          {converted !== null && foreign && (
            <p className="text-sm text-ink-muted">
              {t("detail.inDefault", { amount: formatMoney(converted, workspace.default_currency, locale), rate: rateText })}
            </p>
          )}
          {invoice.amount_paid > 0 && due > 0 && (
            <p className="text-base font-semibold text-lagoon">
              {t("detail.amountPaid", { amount: money(invoice.amount_paid) })} · {t("detail.amountDue", { amount: money(due) })}
            </p>
          )}
          <p className="text-base text-ink">
            <span className="text-ink-muted">{t("detail.client")} </span>
            {contact && (
              <Link href={`/contacts/${contact.id}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
                {contact.name}
              </Link>
            )}
          </p>
          {invoice.quote_id && quoteNumber && (
            <Link href={`/devis/${invoice.quote_id}`} className="self-start text-base font-semibold text-lagoon underline-offset-4 hover:underline">
              {t("detail.fromQuote", { number: quoteNumber })}
            </Link>
          )}
          <ul className="text-sm text-ink-muted">
            {invoice.issued_on && <li>{t("detail.issuedOn", { date: formatDay(invoice.issued_on, locale) })}</li>}
            {invoice.due_on && invoice.status !== "paid" && invoice.status !== "cancelled" && (
              <li>{t("dueOn", { date: formatDay(invoice.due_on, locale) })}</li>
            )}
            {invoice.paid_at && <li>{t("detail.paidAt", { date: formatDay(localDate(new Date(invoice.paid_at)), locale) })}</li>}
          </ul>
        </div>

        {invoice.status === "draft" && (
          <FiscalInfoBlock locale={locale} back={`/factures/${invoice.id}`} missing={fiscalMissing} defaults={fiscalDefaults(workspace)} primary />
        )}
        {fiscal && (
          <FiscalVerificationPanel workspaceId={workspace.id} state={fiscal} hasNumbers locale={locale} context="invoice" />
        )}

        {/* Pas juste après un échec de création du lien : la notice d'échec dit déjà quoi faire. */}
        {papiAccount?.status === "connected" && papiEligible && typeof query.papi !== "string" && (
          <p role="note" className="rounded-xl bg-turquoise-soft px-4 py-3 text-sm font-medium text-ink" data-testid="papi-note">
            {t("detail.papiOpen")}
          </p>
        )}
        {papiAccount?.status === "error" && papiEligible && (
          <p role="note" className="rounded-xl bg-turquoise-soft px-4 py-3 text-sm font-medium text-ink" data-testid="papi-reconnect">
            {t("detail.papiReconnect")}{" "}
            <Link href="/reglages/paiements" className="font-semibold text-lagoon underline underline-offset-4">
              {t("detail.papiReconnectLink")}
            </Link>
          </p>
        )}

        {invoice.status === "draft" && foreign && converted === null && (
          <p role="note" className="rounded-xl bg-turquoise-soft px-4 py-3 text-sm font-medium text-ink">
            {t("detail.rateMissing", { default: workspace.default_currency })}
          </p>
        )}

        <DocumentLines
          lines={invoice.lines}
          currency={invoice.currency}
          locale={locale}
          subtotal={invoice.subtotal}
          discount={invoice.discount}
          total={invoice.total}
        />

        <a href={`/${locale}/factures/${invoice.id}/apercu`} target="_blank" rel="noopener" className={buttonClasses("secondary", true)}>
          {t("detail.preview")}
        </a>
      </div>

      {share && (
        <div className="lg:col-start-2">
          <SharePanel kind="invoice" id={invoice.id} locale={locale} emailEnabled={Boolean(process.env.RESEND_API_KEY)} {...share} />
        </div>
      )}

      {(invoice.status === "draft" || invoice.status === "sent" || invoice.status === "overdue") && (
        <div className="flex flex-col gap-3 border-t border-sand pt-4 lg:col-start-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:border-t-0 lg:pt-0 lg:*:w-auto">
          {invoice.status === "draft" ? (
            <>
              <Link href={`/factures/${invoice.id}/modifier`} className={buttonClasses("secondary", true)}>
                {t("detail.edit")}
              </Link>
              <ConfirmAction
                action={deleteDraft}
                fields={{ ...fields, kind: "invoice" }}
                label={t("detail.delete")}
                variant="danger"
                block
                title={t("confirmDelete.title")}
                body={t("confirmDelete.body")}
                confirmLabel={t("confirmDelete.ok")}
                cancelLabel={t("confirmDelete.cancel")}
              />
            </>
          ) : (
            <ConfirmAction
              action={cancelInvoice}
              fields={fields}
              label={t("detail.cancel")}
              variant="danger"
              block
              title={t("confirmCancel.title")}
              body={t("confirmCancel.body") + papiLinkWarning}
              confirmLabel={t("confirmCancel.ok")}
              cancelLabel={t("confirmCancel.cancel")}
            />
          )}
        </div>
      )}

      {main && <BottomBar className="lg:col-start-2 lg:flex-col lg:items-stretch lg:*:w-full">{main}</BottomBar>}
    </div>
  );
}
