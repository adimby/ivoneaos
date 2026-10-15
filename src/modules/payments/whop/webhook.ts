import { parseWhopPayment, verifyWhopSignature, type WebhookHeaders, type WhopCurrency } from "./adapter";

// Webhook Whop (POST /api/whop/webhook), dans l'ordre :
//   1. signature Standard Webhooks vérifiée avec le secret de la plateforme
//      (WHOP_WEBHOOK_SECRET) ; non authentique : 401, rien n'est enregistré ;
//   2. corps brut enregistré dans webhook_events ;
//   3. payment.succeeded → record_whop_payment (idempotent sur l'identifiant pay_…, lien
//      retrouvé par la référence IVW-… des métadonnées ou la configuration ch_…, montant,
//      devise et compte égaux au lien) ;
//   4. paiement authentique mais non enregistré hors montant (devise autre que EUR/USD,
//      montant illisible, autre compte, autre configuration) : le client a pu être débité,
//      l'anomalie est notée sur le lien retrouvé (affichée sur la facture), sinon journalisée.
// Réponses : 200 dès que l'événement est authentique et traité, même s'il ne change rien
// (autre événement, doublon, anomalie signalée sur le lien) ; 503 si le serveur ne peut
// pas le traiter (Whop réessaie pendant environ 3 jours).

export type WhopRecordResult =
  | "recorded"
  | "duplicate"
  | "unknown_link"
  | "amount_mismatch"
  | "not_payable"
  | "account_mismatch";

// Anomalies notées sur le lien par flagLink (flag_whop_link) : amount_mismatch et
// not_payable le sont déjà par record_whop_payment.
export type WhopLinkFlag = "currency_mismatch" | "incomplete_payment" | "account_mismatch" | "unknown_link";

export type WhopWebhookStore = {
  saveEvent(rawBody: string, payload: unknown): Promise<string>;
  recordPayment(input: {
    merchantReference: string | null;
    checkoutId: string | null;
    accountId: string | null;
    providerReference: string;
    amount: number;
    currency: WhopCurrency;
    fee: number;
    paidAt: string | null;
  }): Promise<WhopRecordResult>;
  flagLink(link: { merchantReference: string | null; checkoutId: string | null }, error: WhopLinkFlag): Promise<boolean>;
  finishEvent(id: string, result: { error: string | null }): Promise<void>;
};

// Anomalie sur le lien retrouvé (affichée sur la facture) ; aucun lien : journalisée pour
// qu'Ivonea la voie dans les journaux du serveur (le client a pu être débité).
async function flag(
  store: WhopWebhookStore,
  payment: { providerReference: string; merchantReference: string | null; checkoutId: string | null },
  error: WhopLinkFlag,
) {
  const { providerReference, merchantReference, checkoutId } = payment;
  const found = merchantReference || checkoutId ? await store.flagLink({ merchantReference, checkoutId }, error) : false;
  if (!found) {
    console.error(`[whop] paiement ${providerReference} non enregistré (${error}), aucun lien retrouvé (${merchantReference ?? checkoutId ?? "sans référence"})`);
  }
}

export type WhopWebhookResponse = { status: number; body: { received: boolean; result?: string; error?: string } };

export async function handleWhopWebhook({
  rawBody,
  headers,
  secret,
  store,
  now = new Date(),
}: {
  rawBody: Buffer;
  headers: WebhookHeaders;
  secret: string;
  store: WhopWebhookStore;
  now?: Date;
}): Promise<WhopWebhookResponse> {
  if (!verifyWhopSignature(rawBody, headers, secret, { now })) {
    return { status: 401, body: { received: false, error: "invalid_signature" } };
  }
  const text = rawBody.toString("utf8");
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { status: 400, body: { received: false, error: "invalid_body" } };
  }
  const eventId = await store.saveEvent(text, payload);

  const payment = parseWhopPayment(payload);
  if (!payment) {
    await store.finishEvent(eventId, { error: null });
    return { status: 200, body: { received: true, result: "ignored" } };
  }
  if ((!payment.merchantReference && !payment.checkoutId) || !payment.currency || payment.amount === null) {
    const error = !payment.currency ? "currency_mismatch" : payment.amount === null ? "incomplete_payment" : "unknown_link";
    try {
      await flag(store, payment, error);
    } catch (cause) {
      await store.finishEvent(eventId, { error: "record_failed" });
      throw cause;
    }
    await store.finishEvent(eventId, { error });
    return { status: 200, body: { received: true, result: error } };
  }

  let recorded: WhopRecordResult;
  try {
    recorded = await store.recordPayment({
      merchantReference: payment.merchantReference,
      checkoutId: payment.checkoutId,
      accountId: payment.accountId,
      providerReference: payment.providerReference,
      amount: payment.amount,
      currency: payment.currency,
      fee: payment.fee,
      paidAt: payment.paidAt,
    });
    if (recorded === "account_mismatch" || recorded === "unknown_link") await flag(store, payment, recorded);
  } catch (cause) {
    await store.finishEvent(eventId, { error: "record_failed" });
    throw cause;
  }
  await store.finishEvent(eventId, { error: recorded === "recorded" || recorded === "duplicate" ? null : recorded });
  return { status: 200, body: { received: true, result: recorded } };
}
