import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon, ChatIcon } from "@/components/icons";
import { BottomBar } from "@/components/ui/bottom-bar";
import { buttonClasses } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appOrigin } from "@/lib/app-url";
import { formatMoney } from "@/lib/money";
import { localDate } from "@/lib/time";
import { convertQuote, decideQuote, deleteDraft, sendQuote } from "@/modules/billing/actions";
import { ConfirmAction } from "@/modules/billing/components/confirm-action";
import { DocumentLines } from "@/modules/billing/components/document-lines";
import { Notices } from "@/modules/billing/components/notices";
import { SharePanel } from "@/modules/billing/components/share-panel";
import { StatusBadge } from "@/modules/billing/components/status-badge";
import { shareMessage, documentEmail } from "@/modules/billing/email";
import { getQuote, getQuoteInvoice } from "@/modules/billing/queries";
import { appDocument } from "@/modules/billing/render";
import { mailtoUrl, publicPath, whatsappShareUrl } from "@/modules/billing/share";
import { quoteDisplayStatus } from "@/modules/billing/status";
import { formatDay } from "@/modules/billing/view";
import { getContact, getDeal } from "@/modules/crm/queries";
import { FiscalVerificationPanel } from "@/modules/verification/components/fiscal-verification-panel";
import { getFiscalState } from "@/modules/verification/queries";
import { FiscalInfoBlock } from "@/modules/workspace/components/fiscal-info-block";
import { fiscalDefaults, hasFiscalInfo } from "@/modules/workspace/profile-schema";
import { getCurrentWorkspace, requireWorkspace } from "@/modules/workspace/queries";

type Props = PageProps<"/[locale]/devis/[id]">;

// Titre de l'onglet : numéro du document une fois émis (lecture mise en cache, partagée
// avec la page), sinon « (brouillon) » ; titre neutre si le document est introuvable.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Billing" });
  const workspace = await getCurrentWorkspace();
  const doc = workspace ? await getQuote(workspace.id, id) : null;
  if (!doc) return { title: t("quoteMetaTitle") };
  return { title: doc.number ? t("quoteTitle", { number: doc.number }) : t("quoteDraftTitle") };
}

// Devis : statut, client, lignes et total, aperçu PDF ; envoi, partage, acceptation et
// « Transformer en facture » (action principale en bas selon le statut).
// Ordinateur : document à gauche (en-tête, lignes, aperçu), partage à droite ; dessous, une
// ligne d'actions (secondaires à gauche, principale à droite). Ordre de lecture et de
// focus ligne par ligne, le même que sur téléphone.
export default async function QuotePage({ params, searchParams }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  const workspace = await requireWorkspace(locale);
  const quote = await getQuote(workspace.id, id);
  if (!quote) notFound();
  const query = await searchParams;
  const today = localDate(new Date());
  const status = quoteDisplayStatus(quote.status, quote.valid_until, today);

  const accepted = quote.status === "accepted";
  const [contact, deal, invoice, fiscal, t, tShare] = await Promise.all([
    getContact(workspace.id, quote.contact_id),
    quote.deal_id ? getDeal(workspace.id, quote.deal_id) : null,
    accepted ? getQuoteInvoice(workspace.id, quote.id) : null,
    // Devis accepté : la facture approche, la vérification de la carte fiscale aussi.
    accepted && hasFiscalInfo(workspace) ? getFiscalState(workspace) : null,
    getTranslations({ locale, namespace: "Billing" }),
    getTranslations({ locale: quote.language, namespace: "Share" }),
  ]);
  const fields = { locale, id: quote.id, back: `/devis/${quote.id}` };
  const hidden = Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);

  // Partage : document émis seulement (le brouillon n'a ni numéro ni page publique).
  let share = null;
  if (quote.status !== "draft") {
    const doc = await appDocument(workspace, { type: "quote", ...quote });
    if (doc) {
      const path = publicPath(quote.language, quote.public_token);
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
  // Validité passée (devis envoyé ou expiré) : nouvelle date d'abord, puis renvoi.
  const validityPast = quote.valid_until !== null && quote.valid_until < today;
  const needsNewValidity = (quote.status === "sent" || quote.status === "expired") && validityPast;

  // Action principale, en bas, selon le statut.
  let main = null;
  if (quote.status === "draft" || (quote.status === "expired" && !validityPast)) {
    main = (
      <form action={sendQuote} className="flex flex-col gap-2">
        {hidden}
        {quote.status === "draft" && <p className="text-sm text-ink-muted">{t("detail.sendQuoteHint")}</p>}
        <SubmitButton block>
          {quote.status === "draft" ? t("detail.sendQuote") : t("detail.resendQuote")}
          <ArrowRightIcon className="size-5" />
        </SubmitButton>
      </form>
    );
  } else if (needsNewValidity) {
    main = (
      <Link href={`/devis/${quote.id}/modifier`} className={buttonClasses("primary", true)}>
        {t("detail.edit")}
      </Link>
    );
  } else if (quote.status === "sent" && share) {
    // Juste après l'envoi, la freelance partage : WhatsApp sous le pouce. « Marquer
    // accepté » (irréversible) reste plus bas, avec confirmation.
    main = (
      <a href={share.whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", true)}>
        <ChatIcon className="size-5" />
        {t("share.whatsapp")}
      </a>
    );
  } else if (quote.status === "accepted") {
    main = invoice ? (
      <Link href={`/factures/${invoice.id}`} className={buttonClasses("primary", true)}>
        {invoice.number ? t("detail.openInvoice", { number: invoice.number }) : t("detail.openDraftInvoice")}
        <ArrowRightIcon className="size-5" />
      </Link>
    ) : (
      <form action={convertQuote}>
        {hidden}
        <SubmitButton block>
          {t("detail.convert")}
          <ArrowRightIcon className="size-5" />
        </SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:content-start lg:items-start lg:gap-x-10">
      <div className="flex flex-col gap-5 lg:col-span-2">
        <Link href="/factures?vue=devis" className="inline-flex min-h-11 items-center self-start text-base font-semibold text-lagoon">
          ← {t("backToList")}
        </Link>
        <Notices query={query} />
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <StatusBadge kind="quote" status={status} className="self-start" />
          <h1 className="text-2xl font-bold break-words text-lagoon">
            {quote.number ? t("quoteTitle", { number: quote.number }) : t("quoteDraftTitle")}
          </h1>
          <p className="text-xl font-bold text-ink" data-testid="document-total">
            {formatMoney(quote.total, quote.currency, locale)}
          </p>
          <p className="text-base text-ink">
            <span className="text-ink-muted">{t("detail.client")} </span>
            {contact ? (
              <Link href={`/contacts/${contact.id}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
                {contact.name}
              </Link>
            ) : null}
          </p>
          {deal && (
            <p className="text-base text-ink">
              <span className="text-ink-muted">{t("detail.deal")} </span>
              <Link href={`/pipeline/${deal.id}`} className="font-semibold text-lagoon underline-offset-4 hover:underline">
                {deal.title}
              </Link>
            </p>
          )}
          <ul className="text-sm text-ink-muted">
            {quote.sent_at && <li>{t("detail.sentAt", { date: formatDay(localDate(new Date(quote.sent_at)), locale) })}</li>}
            {quote.valid_until && <li>{t("validUntil", { date: formatDay(quote.valid_until, locale) })}</li>}
            {quote.accepted_at && <li>{t("detail.acceptedAt", { date: formatDay(localDate(new Date(quote.accepted_at)), locale) })}</li>}
          </ul>
        </div>

        {status === "sent" && <p className="text-base text-ink-muted">{t("detail.sentHint")}</p>}
        {quote.status === "accepted" && !invoice && <p className="text-base text-ink-muted">{t("detail.acceptedHint")}</p>}
        {/* Devis accepté : la facture approche, NIF / STAT / régime demandés dès maintenant (la transformation reste possible). */}
        {quote.status === "accepted" && !invoice && (
          <FiscalInfoBlock locale={locale} back={`/devis/${quote.id}`} missing={!hasFiscalInfo(workspace)} defaults={fiscalDefaults(workspace)} fiscalStatus={workspace.fiscal_status} />
        )}
        {fiscal && !invoice && <FiscalVerificationPanel workspaceId={workspace.id} state={fiscal} hasNumbers locale={locale} context="invoice" />}
        {needsNewValidity && <p className="text-base text-ink-muted">{t("detail.expiredHint")}</p>}

        <DocumentLines
          lines={quote.lines}
          currency={quote.currency}
          locale={locale}
          subtotal={quote.subtotal}
          discount={quote.discount}
          total={quote.total}
        />

        <a href={`/${locale}/devis/${quote.id}/apercu`} target="_blank" rel="noopener" className={buttonClasses("secondary", true)}>
          {t("detail.preview")}
        </a>
      </div>

      {share && (
        <div className="lg:col-start-2">
          <SharePanel
            kind="quote"
            id={quote.id}
            locale={locale}
            emailEnabled={Boolean(process.env.RESEND_API_KEY)}
            showWhatsapp={quote.status !== "sent"}
            {...share}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-sand pt-4 lg:col-start-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:border-t-0 lg:pt-0 lg:*:w-auto">
        {(quote.status === "draft" || ((quote.status === "sent" || quote.status === "expired") && !needsNewValidity)) && (
          <Link href={`/devis/${quote.id}/modifier`} className={buttonClasses("secondary", true)}>
            {t("detail.edit")}
          </Link>
        )}
        {/* Décision du client reçue hors ligne : irréversible, toujours confirmée. */}
        {quote.status === "sent" && !validityPast && (
          <>
            <ConfirmAction
              action={decideQuote}
              fields={{ ...fields, status: "accepted" }}
              label={t("detail.accept")}
              block
              title={t("confirmAccept.title")}
              body={t("confirmAccept.body")}
              confirmLabel={t("confirmAccept.ok")}
              cancelLabel={t("confirmAccept.cancel")}
            />
            <ConfirmAction
              action={decideQuote}
              fields={{ ...fields, status: "declined" }}
              label={t("detail.decline")}
              variant="ghost"
              block
              title={t("confirmDecline.title")}
              body={t("confirmDecline.body")}
              confirmLabel={t("confirmDecline.ok")}
              cancelLabel={t("confirmDecline.cancel")}
            />
          </>
        )}
        {quote.status === "draft" && (
          <ConfirmAction
            action={deleteDraft}
            fields={{ ...fields, kind: "quote" }}
            label={t("detail.delete")}
            variant="danger"
            block
            title={t("confirmDelete.title")}
            body={t("confirmDelete.body")}
            confirmLabel={t("confirmDelete.ok")}
            cancelLabel={t("confirmDelete.cancel")}
          />
        )}
      </div>

      {main && <BottomBar className="lg:col-start-2 lg:flex-col lg:items-stretch lg:*:w-full">{main}</BottomBar>}
    </div>
  );
}
