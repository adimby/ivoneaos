import { timingSafeEqual } from "node:crypto";
import type { PaymentMethod, PaymentProvider } from "../provider";
import { parsePapiNotification } from "./adapter";

// Notification Papi (POST sur /api/papi/notification), dans l'ordre exigé :
//   1. corps brut enregistré dans webhook_events, avant toute vérification. Afflux de
//      notifications non authentiques : le corps n'est plus enregistré qu'une fois la
//      signature vérifiée (les autres sont refusées sans trace), une vraie notification
//      n'est jamais refusée à cause de ce trafic ;
//   2. signature X-Papi-Signature vérifiée avec le secret de la freelance concernée
//      (celui gardé sur le lien à sa création, puis le secret actuel du compte) ;
//   3. merchantPaymentReference et notificationToken comparés au lien enregistré ;
//   4. paiement réussi → record_papi_payment (idempotent, montant égal au lien).
// Réponses : 2xx dès que la notification est vérifiée et traitée, même si le paiement ne
// peut pas être enregistré (montant différent, facture non payable : anomalie signalée
// sur le lien et dans webhook_events, Papi n'a rien à renvoyer) ; 401 si elle n'est pas
// authentique ; 503 si le serveur ne peut pas la traiter pour l'instant (Papi la marque
// en échec, le rattrapage quotidien relira le lien).

export type RecordResult = "recorded" | "duplicate" | "unknown_link" | "amount_mismatch" | "not_payable";

export type NotificationStore = {
  // false : trop de notifications non authentiques récemment, n'enregistrer que les
  // notifications à la signature vérifiée.
  acceptingEvents(now: Date): Promise<boolean>;
  saveEvent(rawBody: string, payload: unknown): Promise<string>;
  // Lien Papi par référence marchande, avec les secrets de signature (déchiffrés) à essayer.
  findLink(merchantReference: string): Promise<{ notificationToken: string | null; signingSecrets: string[] } | null>;
  recordPayment(input: {
    merchantReference: string;
    providerReference: string;
    amount: number;
    fee: number;
    method: PaymentMethod;
  }): Promise<RecordResult>;
  finishEvent(id: string, result: { signatureValid: boolean | null; error: string | null }): Promise<void>;
};

export type NotificationResponse = { status: number; body: { received: boolean; result?: string; error?: string } };

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function handlePapiNotification({
  rawBody,
  signature,
  store,
  provider,
  now = new Date(),
}: {
  rawBody: Buffer;
  signature: string | null;
  store: NotificationStore;
  provider: PaymentProvider;
  now?: Date;
}): Promise<NotificationResponse> {
  const text = rawBody.toString("utf8");
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Enregistré tel quel ; rejeté plus bas.
  }
  let eventId = (await store.acceptingEvents(now)) ? await store.saveEvent(text, payload) : null;
  const reject = async (status: number, error: string, signatureValid: boolean | null = null): Promise<NotificationResponse> => {
    if (eventId) await store.finishEvent(eventId, { signatureValid, error });
    return { status, body: { received: false, error } };
  };

  // La référence (non encore authentifiée) sert seulement à trouver le secret à utiliser.
  const unverified = parsePapiNotification(payload);
  if (!unverified) return reject(400, "invalid_body");
  const link = await store.findLink(unverified.merchantReference);
  if (!link) return reject(401, "unknown_reference");
  if (link.signingSecrets.length === 0) return reject(401, "no_signing_secret");

  let notification = null;
  for (const secret of link.signingSecrets) {
    notification = provider.verifyNotification(rawBody, signature, secret, now);
    if (notification) break;
  }
  if (!notification) return reject(401, "invalid_signature", false);
  eventId ??= await store.saveEvent(text, payload);
  if (
    notification.merchantReference !== unverified.merchantReference ||
    !notification.notificationToken ||
    !link.notificationToken ||
    !sameText(notification.notificationToken, link.notificationToken)
  ) {
    return reject(401, "token_mismatch", true);
  }

  // Seul un paiement réussi change la facture. FAILED / PENDING : le lien reste payable.
  let result: string = notification.status ?? "unknown_status";
  let error: string | null = null;
  if (notification.status === "SUCCESS") {
    if (!notification.providerReference || notification.amount === null) {
      error = "incomplete_payment";
    } else {
      let recorded: RecordResult;
      try {
        recorded = await store.recordPayment({
          merchantReference: notification.merchantReference,
          providerReference: notification.providerReference,
          amount: notification.amount,
          fee: notification.fee,
          // Moyen non reconnu : paiement tout de même enregistré, sans moyen précis.
          method: notification.method ?? "manual",
        });
      } catch (cause) {
        // Erreur passagère (base indisponible) : visible dans webhook_events, 503 plus haut.
        await store.finishEvent(eventId, { signatureValid: true, error: "record_failed" });
        throw cause;
      }
      result = recorded;
      if (recorded !== "recorded" && recorded !== "duplicate") error = recorded;
    }
  }
  await store.finishEvent(eventId, { signatureValid: true, error });
  // Notification authentique et enregistrée : 200, même si elle ne change rien (doublon,
  // montant à examiner) ; Papi n'a rien à renvoyer.
  return { status: 200, body: { received: true, result } };
}
