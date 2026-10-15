import "server-only";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { LinkOutcome, PayableInvoice } from "../papi/service";
import {
  applicationFee,
  createConnectedAccount,
  createOnboardingLink,
  deleteCheckoutConfiguration,
  getAccountStatus,
  platformFeePercent,
  whop,
  WHOP_CURRENCIES,
  whopApiKey,
} from "./adapter";
import type { WhopRecordResult, WhopWebhookStore } from "./webhook";

// Opérations Whop côté serveur (clé de la plateforme, client « secret »). Chaque fonction
// est appelée après contrôle de l'accès (session de la freelance, ou jeton public de la
// facture). Sans WHOP_API_KEY, Whop est masqué partout et ces fonctions ne font rien.

// Whop proposé : clé de la plateforme, secret du webhook et client serveur configurés.
// Sans secret, le webhook répond 503 et un paiement par carte ne serait jamais enregistré :
// Whop reste alors masqué partout (connexion, « Payer par carte »).
export function whopEnabled(): boolean {
  return Boolean(
    whopApiKey() && process.env.WHOP_WEBHOOK_SECRET?.trim() && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

// Clé de la plateforme si Whop est entièrement configuré, sinon null.
function platformKey(): string | null {
  return whopEnabled() ? whopApiKey() : null;
}

async function check<T extends { error: unknown }>(query: PromiseLike<T>): Promise<Extract<T, { error: null }>> {
  const result = await query;
  if (result.error) throw result.error;
  return result as Extract<T, { error: null }>;
}

async function whopAccount(admin: AdminClient, workspaceId: string) {
  const { data } = await check(
    admin
      .from("payment_accounts")
      .select("id, status, external_account_id")
      .eq("workspace_id", workspaceId)
      .eq("provider", "whop")
      .maybeSingle(),
  );
  return data;
}

// ---------------------------------------------------------------------------
// Connexion : compte connecté créé sous la plateforme, puis inscription chez Whop.
// ---------------------------------------------------------------------------

export type OnboardingResult = { status: "redirect"; url: string } | { status: "failed"; reason: "unavailable" | "disabled" | "rejected" };

export async function startWhopOnboarding(
  workspace: { id: string; name: string },
  { email, returnUrl, refreshUrl }: { email: string; returnUrl: string; refreshUrl: string },
): Promise<OnboardingResult> {
  const apiKey = platformKey();
  const admin = createAdminClient();
  if (!apiKey || !admin) return { status: "failed", reason: "disabled" };

  const account = await whopAccount(admin, workspace.id);
  let accountId = account?.external_account_id ?? null;
  if (!accountId) {
    const created = await createConnectedAccount(apiKey, { email, title: workspace.name, externalId: workspace.id });
    if (!created.ok) {
      console.error(`[whop] compte connecté non créé (${created.error})`);
      return { status: "failed", reason: created.error === "rejected" ? "rejected" : "unavailable" };
    }
    accountId = await keepFirstAccount(admin, workspace.id, created.value.id);
  }

  const link = await createOnboardingLink(apiKey, { accountId, returnUrl, refreshUrl });
  if (!link.ok) {
    console.error(`[whop] lien d'inscription non créé (${link.error})`);
    return { status: "failed", reason: "unavailable" };
  }
  return { status: "redirect", url: link.value.url };
}

// Double envoi (deux clics, connexion lente) : deux créations parallèles. Seul le premier
// compte enregistré est gardé (écrit seulement si external_account_id est encore vide) ;
// l'autre requête reprend celui-ci. Whop renvoie normalement le même compte (idempotent sur
// e-mail + external_id) : un identifiant différent est seulement signalé.
async function keepFirstAccount(admin: AdminClient, workspaceId: string, createdId: string): Promise<string> {
  await check(
    admin
      .from("payment_accounts")
      .upsert({ workspace_id: workspaceId, provider: "whop", status: "pending" }, { onConflict: "workspace_id,provider", ignoreDuplicates: true }),
  );
  await check(
    admin
      .from("payment_accounts")
      .update({ external_account_id: createdId })
      .eq("workspace_id", workspaceId)
      .eq("provider", "whop")
      .is("external_account_id", null),
  );
  const kept = (await whopAccount(admin, workspaceId))?.external_account_id;
  if (!kept) throw new Error("whop_account_not_saved");
  if (kept !== createdId) console.warn(`[whop] compte connecté en double ignoré (${createdId}), ${kept} conservé`);
  return kept;
}

// Retour de l'inscription Whop : le compte encaisse-t-il les cartes ? Statut enregistré.
export async function refreshWhopStatus(workspaceId: string): Promise<"connected" | "pending" | "unavailable" | "disabled"> {
  const apiKey = platformKey();
  const admin = createAdminClient();
  if (!apiKey || !admin) return "disabled";
  const account = await whopAccount(admin, workspaceId);
  if (!account?.external_account_id) return "pending";
  const state = await getAccountStatus(apiKey, account.external_account_id);
  if (!state.ok) {
    console.error(`[whop] compte non relu (${state.error})`);
    return "unavailable";
  }
  const status = state.value.canAcceptCards ? "connected" : "pending";
  await check(
    admin.from("payment_accounts").update({ status, last_checked_at: new Date().toISOString() }).eq("id", account.id),
  );
  return status;
}

// ---------------------------------------------------------------------------
// Lien de paiement par carte d'une facture EUR/USD
// ---------------------------------------------------------------------------

const INVOICE_LABEL = { fr: "Facture", en: "Invoice" } as const;

function isWhopEligible(invoice: PayableInvoice): boolean {
  return (
    (WHOP_CURRENCIES as readonly string[]).includes(invoice.currency) &&
    (invoice.status === "sent" || invoice.status === "overdue") &&
    invoice.total > invoice.amountPaid
  );
}

// Lien payable de la facture : le lien actif s'il demande encore le reste dû, sinon une
// nouvelle configuration de paiement IVW-<facture>-<tentative> sur le compte connecté.
export async function ensureInvoiceWhopLink(invoice: PayableInvoice, { origin }: { origin: string }): Promise<LinkOutcome> {
  if (!isWhopEligible(invoice)) return { status: "skipped" };
  const apiKey = platformKey();
  const admin = createAdminClient();
  if (!apiKey || !admin) return { status: "skipped" };
  const account = await whopAccount(admin, invoice.workspaceId);
  if (account?.status !== "connected" || !account.external_account_id) return { status: "skipped" };

  const due = invoice.total - invoice.amountPaid;
  const { data: links } = await check(
    admin
      .from("payment_links")
      .select("provider_url, status, amount")
      .eq("invoice_id", invoice.id)
      .eq("provider", "whop")
      .order("created_at", { ascending: false }),
  );
  const current = links.find((l) => l.status === "active" && l.provider_url && l.amount === due);
  if (current?.provider_url) return { status: "ready", url: current.provider_url };
  // Reste dû changé (paiement partiel) : les liens d'un autre montant sont annulés ici et
  // retirés chez Whop. Ceux du reste dû sont gardés : un lien que vient de créer une
  // ouverture simultanée de /carte (même référence, même configuration) reste payable.
  await retireActiveLinks(admin, apiKey, invoice.id, { keepAmount: due });

  const reference = `IVW-${invoice.id}-${links.length + 1}`;
  const label = invoice.number ? `${INVOICE_LABEL[invoice.language]} ${invoice.number}` : INVOICE_LABEL[invoice.language];
  const created = await whop.createLink(apiKey, {
    amount: due,
    reference,
    clientName: invoice.clientName || invoice.businessName,
    description: `${label} · ${invoice.businessName}`,
    successUrl: `${invoice.publicUrl}?paiement=ok`,
    failureUrl: `${invoice.publicUrl}?paiement=echec`,
    notificationUrl: `${origin}/api/whop/webhook`,
    validDurationHours: 0,
    currency: invoice.currency,
    accountId: account.external_account_id,
    applicationFee: applicationFee(due, platformFeePercent()),
  });
  if (!created.ok) {
    console.error(`[whop] lien non créé (${created.error}) pour ${reference}`);
    return { status: "failed", reason: created.error === "not_found" ? "unavailable" : created.error };
  }

  const { error } = await admin.from("payment_links").insert({
    workspace_id: invoice.workspaceId,
    invoice_id: invoice.id,
    payment_account_id: account.id,
    provider: "whop",
    merchant_reference: reference,
    provider_link_id: created.value.notificationToken,
    provider_url: created.value.url,
    status: "active",
    amount: due,
  });
  // Deux ouvertures simultanées : même référence, Whop renvoie la même configuration
  // (Idempotency-Key) ; la ligne existe déjà.
  if (error && error.code !== "23505") throw error;
  return { status: "ready", url: created.value.url };
}

// Liens Whop actifs de la facture (sauf ceux du montant keepAmount) : annulés ici, puis
// leur configuration (ch_…) supprimée chez Whop pour que l'ancien montant ne soit plus
// payable. Suppression impossible (Whop indisponible) : le lien reste annulé ici ; s'il est
// payé quand même, le paiement est enregistré (argent reçu) et la facture affiche le
// trop-perçu.
async function retireActiveLinks(admin: AdminClient, apiKey: string, invoiceId: string, { keepAmount }: { keepAmount?: number } = {}) {
  let query = admin
    .from("payment_links")
    .update({ status: "cancelled" })
    .eq("invoice_id", invoiceId)
    .eq("provider", "whop")
    .eq("status", "active");
  if (keepAmount !== undefined) query = query.neq("amount", keepAmount);
  const { data: retired } = await check(query.select("merchant_reference, provider_link_id"));
  await Promise.all(
    retired.map(async (link) => {
      if (!link.provider_link_id) return;
      const deleted = await deleteCheckoutConfiguration(apiKey, link.provider_link_id);
      if (!deleted.ok) console.error(`[whop] paiement ${link.merchant_reference} non retiré chez Whop (${deleted.error})`);
    }),
  );
}

// Facture réglée autrement (paiement manuel) ou annulée : plus de paiement par carte.
// Appelé après le contrôle d'accès de la freelance ; sans Whop configuré, rien à faire.
export async function retireInvoiceWhopLinks(invoiceId: string): Promise<void> {
  const apiKey = platformKey();
  const admin = createAdminClient();
  if (!apiKey || !admin) return;
  await retireActiveLinks(admin, apiKey, invoiceId);
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export function whopWebhookStore(admin: AdminClient): WhopWebhookStore {
  return {
    async saveEvent(rawBody, payload) {
      const { data } = await check(
        admin
          .from("webhook_events")
          .insert({ provider: "whop", raw_body: rawBody, payload: payload as never, signature_valid: true })
          .select("id")
          .single(),
      );
      return data.id;
    },
    async recordPayment(input) {
      const { data } = await check(
        admin.rpc("record_whop_payment", {
          p_merchant_reference: input.merchantReference as string,
          p_checkout_id: input.checkoutId as string,
          p_account_id: input.accountId as string,
          p_provider_reference: input.providerReference,
          p_amount: input.amount,
          p_currency: input.currency,
          p_fee: input.fee,
          ...(input.paidAt && { p_paid_at: input.paidAt }),
        }),
      );
      return data as WhopRecordResult;
    },
    async flagLink({ merchantReference, checkoutId }, error) {
      const { data } = await check(
        admin.rpc("flag_whop_link", {
          p_merchant_reference: merchantReference as string,
          p_checkout_id: checkoutId as string,
          p_error: error,
        }),
      );
      return data === true;
    },
    async finishEvent(id, { error }) {
      await check(admin.from("webhook_events").update({ error, processed_at: new Date().toISOString() }).eq("id", id));
    },
  };
}
