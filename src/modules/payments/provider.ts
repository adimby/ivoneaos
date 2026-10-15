// Interface commune des prestataires de paiement en ligne : Papi (ariary, clé de la
// freelance) et Whop (euros et dollars, clé de la plateforme, compte connecté de la
// freelance ; seul createLink est commun). Les montants sont en unités mineures (ariary,
// centimes). Aucune donnée secrète dans les erreurs : la clé et le secret ne sortent
// jamais de l'adaptateur.

export type PaymentMethod = "MVOLA" | "ORANGE_MONEY" | "AIRTEL_MONEY" | "CARD" | "manual";

// Statut du lien et issue du paiement, valeurs de la doc Papi.
export type LinkStatus = "ACTIVE" | "EXPIRED" | "PAID" | "DISABLED";
export type PaymentStatus = "SUCCESS" | "PENDING" | "FAILED";

export type CreateLinkInput = {
  amount: number;
  reference: string;
  clientName: string;
  description: string;
  successUrl: string;
  failureUrl: string;
  notificationUrl: string;
  validDurationHours: number;
  // Whop : devise de la facture, compte connecté (biz_…) qui encaisse, et commission de la
  // plateforme en unités mineures (0 : aucune).
  currency?: string;
  accountId?: string;
  applicationFee?: number;
};

export type CreatedLink = { url: string; notificationToken: string | null; expiresAt: Date | null };

export type LinkState = {
  linkStatus: LinkStatus;
  paymentStatus: PaymentStatus | null;
  method: PaymentMethod | null;
  amount: number | null;
  // Référence du paiement chez le prestataire (idempotence de payments).
  providerReference: string | null;
  notificationToken: string | null;
};

export type Notification = {
  merchantReference: string;
  providerReference: string | null;
  status: PaymentStatus | null;
  amount: number | null;
  fee: number;
  method: PaymentMethod | null;
  notificationToken: string | null;
};

// unauthorized : clé refusée ; rejected : requête refusée (validation) ; conflict : un
// lien actif existe pour cette référence avec un autre montant ; unavailable : réseau,
// délai dépassé ou erreur du prestataire (réessayer plus tard).
export type ProviderError = "unauthorized" | "not_found" | "rejected" | "conflict" | "unavailable";
export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError; message?: string };

export interface PaymentProvider {
  createLink(apiKey: string, input: CreateLinkInput): Promise<ProviderResult<CreatedLink>>;
  getLinkStatus(apiKey: string, reference: string): Promise<ProviderResult<LinkState>>;
  verifyCredentials(apiKey: string): Promise<"valid" | "invalid" | "unavailable">;
  // Corps brut et en-tête de signature → notification lue, ou null si la signature est
  // absente, invalide ou trop ancienne.
  verifyNotification(rawBody: Buffer, signature: string | null, secret: string, now?: Date): Notification | null;
}
