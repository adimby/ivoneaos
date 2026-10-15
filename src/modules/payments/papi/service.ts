import "server-only";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { LinkState, PaymentProvider, ProviderResult } from "../provider";
import {
  decryptSecret,
  encryptSecret,
  linkSecretAad,
  paymentSecretsAvailable,
  secretAad,
  SecretsUnavailableError,
} from "../secrets";
import { papi, PAPI_MIN_AMOUNT } from "./adapter";
import type { NotificationStore, RecordResult } from "./notification";

// Opérations Papi côté serveur. Les secrets chiffrés ne sont lisibles qu'avec le client
// « secret » (rôle serveur) : chaque fonction est appelée après contrôle de l'accès
// (session de la freelance, ou jeton public de la facture), jamais avec un identifiant
// venu du navigateur sans ce contrôle.

// Validité d'un lien : 7 jours (doc : entier > 0, au plus 596 heures). Un lien expiré
// est recréé quand le client rouvre la facture.
export const PAPI_VALID_HOURS = 168;
// Un lien qui expire dans moins de 10 minutes n'est plus proposé : nouveau lien.
const EXPIRY_MARGIN_MS = 10 * 60_000;
// Papi ne permet pas de désactiver un lien : un lien annulé localement reste payable
// jusqu'à son expiration. Le rattrapage le relit jusque-là, plus ce délai (paiement fait
// juste avant l'expiration) ; ensuite le lien est clos et ses copies de clé et de secret
// effacées.
const LINK_GRACE_MS = 2 * 24 * 3600_000;
// Notifications non authentiques gardées 30 jours (examen), puis purgées.
const UNVERIFIED_EVENTS_RETENTION_MS = 30 * 24 * 3600_000;

// Secret de signature : « pwhsec_ » suivi de 64 caractères hexadécimaux minuscules.
export const SIGNING_SECRET = /^pwhsec_[0-9a-f]{64}$/;
// Clé API : une longue chaîne sans espace.
export const API_KEY = /^[\x21-\x7e]{16,512}$/;

export type ConnectResult = "connected" | "invalid_key" | "invalid_key_format" | "invalid_secret" | "unavailable" | "disabled";

// Connexion possible ? (clé de chiffrement et client serveur configurés)
export function papiConnectEnabled(): boolean {
  return paymentSecretsAvailable() && Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

// ---------------------------------------------------------------------------
// Accès aux données (client serveur). Interface pour les tests sans base.
// ---------------------------------------------------------------------------

export type PapiAccount = { id: string; apiKey: string; signingSecret: string };
export type StoredLink = { reference: string; url: string | null; status: string; expiresAt: Date | null; amount: number | null };
// status « failed » : tentative refusée par Papi (409), notée pour ne pas réutiliser sa
// référence ; ni lien ni secrets.
export type NewLink = {
  workspaceId: string;
  invoiceId: string;
  accountId: string;
  reference: string;
  status: "active" | "failed";
  url: string | null;
  notificationToken: string | null;
  amount: number;
  expiresAt: Date | null;
  apiKey: string;
  signingSecret: string;
};
// apiKey : clé qui a créé le lien (copie gardée sur le lien), null si absente ou illisible.
export type LinkToCheck = { workspaceId: string; reference: string; status: string; apiKey: string | null };

export type PapiStore = {
  // Compte connecté et ses secrets déchiffrés ; null si Papi n'est pas connecté.
  getAccount(workspaceId: string): Promise<PapiAccount | null>;
  // Clé refusée par Papi (révoquée) : le paiement Papi n'est plus proposé (liens ouverts
  // annulés, encore relus par le rattrapage), la freelance est invitée à reconnecter Papi.
  markNeedsReconnect(workspaceId: string): Promise<void>;
  // Liens Papi de la facture, du plus récent au plus ancien.
  listLinks(invoiceId: string): Promise<StoredLink[]>;
  closeLink(reference: string, status: "cancelled" | "expired"): Promise<void>;
  // Référence déjà enregistrée (deux ouvertures simultanées) : sans effet.
  insertLink(link: NewLink): Promise<void>;
  recordPayment: NotificationStore["recordPayment"];
  // Rattrapage.
  closeStaleLinks(cutoff: Date): Promise<void>;
  linksToCheck(limit: number, cancelledAfter: Date): Promise<LinkToCheck[]>;
  touchLink(reference: string, error: string | null): Promise<void>;
  purgeUnverifiedEvents(before: Date): Promise<void>;
};

async function check<T extends { error: unknown }>(query: PromiseLike<T>): Promise<Extract<T, { error: null }>> {
  const result = await query;
  if (result.error) throw result.error;
  return result as Extract<T, { error: null }>;
}

async function recordPapiPayment(admin: AdminClient, input: Parameters<NotificationStore["recordPayment"]>[0]): Promise<RecordResult> {
  const { data } = await check(
    admin.rpc("record_papi_payment", {
      p_merchant_reference: input.merchantReference,
      p_provider_reference: input.providerReference,
      p_amount: input.amount,
      p_fee: input.fee,
      p_method: input.method,
    }),
  );
  return data as RecordResult;
}

export function papiStore(admin: AdminClient): PapiStore {
  return {
    async getAccount(workspaceId) {
      const { data } = await check(
        admin
          .from("payment_accounts")
          .select("id, encrypted_api_key, encrypted_signing_secret")
          .eq("workspace_id", workspaceId)
          .eq("provider", "papi")
          .eq("status", "connected")
          .maybeSingle(),
      );
      if (!data?.encrypted_api_key || !data.encrypted_signing_secret) return null;
      return {
        id: data.id,
        apiKey: decryptSecret(data.encrypted_api_key, secretAad(workspaceId, "papi", "api_key")),
        signingSecret: decryptSecret(data.encrypted_signing_secret, secretAad(workspaceId, "papi", "signing_secret")),
      };
    },
    async markNeedsReconnect(workspaceId) {
      await check(
        admin
          .from("payment_accounts")
          .update({ status: "error" })
          .eq("workspace_id", workspaceId)
          .eq("provider", "papi")
          .eq("status", "connected"),
      );
      await check(
        admin.from("payment_links").update({ status: "cancelled" }).eq("workspace_id", workspaceId).eq("provider", "papi").eq("status", "active"),
      );
    },
    async listLinks(invoiceId) {
      const { data } = await check(
        admin
          .from("payment_links")
          .select("merchant_reference, provider_url, status, expires_at, amount")
          .eq("invoice_id", invoiceId)
          .eq("provider", "papi")
          .order("created_at", { ascending: false }),
      );
      return data.map((row) => ({
        reference: row.merchant_reference,
        url: row.provider_url,
        status: row.status,
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
        amount: row.amount,
      }));
    },
    async closeLink(reference, status) {
      await check(
        admin.from("payment_links").update({ status }).eq("provider", "papi").eq("merchant_reference", reference).eq("status", "active"),
      );
    },
    async insertLink(link) {
      const active = link.status === "active";
      const aad = (field: "api_key" | "signing_secret") => linkSecretAad(link.workspaceId, "papi", link.reference, field);
      const { error } = await admin.from("payment_links").insert({
        workspace_id: link.workspaceId,
        invoice_id: link.invoiceId,
        payment_account_id: link.accountId,
        provider: "papi",
        merchant_reference: link.reference,
        status: link.status,
        last_error: active ? null : "conflict",
        provider_url: link.url,
        notification_token: link.notificationToken,
        encrypted_api_key: active ? encryptSecret(link.apiKey, aad("api_key")) : null,
        encrypted_signing_secret: active ? encryptSecret(link.signingSecret, aad("signing_secret")) : null,
        amount: link.amount,
        expires_at: link.expiresAt?.toISOString() ?? null,
      });
      if (error && error.code !== "23505") throw error;
    },
    recordPayment: (input) => recordPapiPayment(admin, input),
    async closeStaleLinks(cutoff) {
      await check(
        admin
          .from("payment_links")
          .update({ status: "expired" })
          .eq("provider", "papi")
          .eq("status", "active")
          .lt("expires_at", cutoff.toISOString()),
      );
      await check(
        admin
          .from("payment_links")
          .update({ encrypted_api_key: null, encrypted_signing_secret: null, notification_token: null })
          .eq("provider", "papi")
          .lt("expires_at", cutoff.toISOString())
          .or("encrypted_api_key.not.is.null,encrypted_signing_secret.not.is.null"),
      );
    },
    async linksToCheck(limit, cancelledAfter) {
      const { data } = await check(
        admin
          .from("payment_links")
          .select("workspace_id, merchant_reference, status, encrypted_api_key")
          .eq("provider", "papi")
          .or(`status.eq.active,and(status.eq.cancelled,expires_at.gt.${cancelledAfter.toISOString()})`)
          .order("last_checked_at", { ascending: true, nullsFirst: true })
          .limit(limit),
      );
      return data.map((row) => ({
        workspaceId: row.workspace_id,
        reference: row.merchant_reference,
        status: row.status,
        apiKey: row.encrypted_api_key ? readLinkApiKey(row.encrypted_api_key, row.workspace_id, row.merchant_reference) : null,
      }));
    },
    async touchLink(reference, error) {
      await check(
        admin
          .from("payment_links")
          .update({ last_checked_at: new Date().toISOString(), ...(error && { last_error: error }) })
          .eq("provider", "papi")
          .eq("merchant_reference", reference),
      );
    },
    async purgeUnverifiedEvents(before) {
      await check(admin.from("webhook_events").delete().not("signature_valid", "is", true).lt("created_at", before.toISOString()));
    },
  };
}

function readLinkApiKey(encrypted: string, workspaceId: string, reference: string): string | null {
  try {
    return decryptSecret(encrypted, linkSecretAad(workspaceId, "papi", reference, "api_key"));
  } catch (error) {
    if (error instanceof SecretsUnavailableError) throw error;
    return null; // illisible (clé de chiffrement changée) : relu avec la clé du compte
  }
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export async function connectPapi(workspaceId: string, apiKey: string, signingSecret: string): Promise<ConnectResult> {
  if (!API_KEY.test(apiKey)) return "invalid_key_format";
  if (!SIGNING_SECRET.test(signingSecret)) return "invalid_secret";
  const admin = createAdminClient();
  if (!admin || !paymentSecretsAvailable()) return "disabled";

  // Appel de lecture : 401 = clé inconnue, 404 = clé valide.
  const verified = await papi.verifyCredentials(apiKey);
  if (verified === "invalid") return "invalid_key";
  if (verified === "unavailable") return "unavailable";

  // Clé remplacée par une autre (autre boutique) : les liens ouverts ont été créés avec
  // l'ancienne clé. Ils ne sont plus proposés : le prochain clic du client crée un lien
  // dans la nouvelle boutique. Payés quand même, leur notification reste vérifiée avec
  // la copie du secret gardée sur chaque lien, et le rattrapage les relit avec la copie de
  // l'ancienne clé.
  const { data: previous } = await check(
    admin.from("payment_accounts").select("encrypted_api_key").eq("workspace_id", workspaceId).eq("provider", "papi").maybeSingle(),
  );
  if (previous?.encrypted_api_key && !sameStoredKey(previous.encrypted_api_key, workspaceId, apiKey)) {
    await check(
      admin.from("payment_links").update({ status: "cancelled" }).eq("workspace_id", workspaceId).eq("provider", "papi").eq("status", "active"),
    );
  }

  await check(
    admin.from("payment_accounts").upsert(
      {
        workspace_id: workspaceId,
        provider: "papi",
        status: "connected",
        encrypted_api_key: encryptSecret(apiKey, secretAad(workspaceId, "papi", "api_key")),
        encrypted_signing_secret: encryptSecret(signingSecret, secretAad(workspaceId, "papi", "signing_secret")),
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" },
    ),
  );
  return "connected";
}

function sameStoredKey(encrypted: string, workspaceId: string, apiKey: string): boolean {
  try {
    return decryptSecret(encrypted, secretAad(workspaceId, "papi", "api_key")) === apiKey;
  } catch {
    return false; // illisible (clé de chiffrement changée) : traitée comme une autre clé
  }
}

// Déconnexion : clé et secret du compte effacés ; les liens ouverts ne sont plus proposés.
// Chaque lien garde ses copies chiffrées de la clé et du secret jusqu'à son expiration : un
// client qui paie encore un lien déjà ouvert est bien enregistré (notification ou rattrapage).
export async function disconnectPapi(workspaceId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await check(
    admin
      .from("payment_accounts")
      .update({ status: "disabled", encrypted_api_key: null, encrypted_signing_secret: null })
      .eq("workspace_id", workspaceId)
      .eq("provider", "papi")
      .select("id"),
  );
  if (data.length) {
    await check(
      admin.from("payment_links").update({ status: "cancelled" }).eq("workspace_id", workspaceId).eq("provider", "papi").eq("status", "active"),
    );
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lien de paiement d'une facture
// ---------------------------------------------------------------------------

export type PayableInvoice = {
  id: string;
  workspaceId: string;
  number: string | null;
  currency: string;
  status: string;
  total: number;
  amountPaid: number;
  // Langue de la facture : libellé montré au client sur le formulaire Papi.
  language: "fr" | "en";
  clientName: string;
  businessName: string;
  // Page publique de la facture (retour après paiement), ex. https://app/fr/p/<jeton>.
  publicUrl: string;
};

export type LinkFailure = "unauthorized" | "rejected" | "conflict" | "unavailable" | "disabled";
export type LinkOutcome =
  | { status: "ready"; url: string }
  | { status: "paid" }
  // Papi non proposé : pas connecté, autre devise, facture non payable, moins de 300 Ar.
  | { status: "skipped" }
  | { status: "failed"; reason: LinkFailure };

const INVOICE_LABEL = { fr: "Facture", en: "Invoice" } as const;

function isPapiEligible(invoice: PayableInvoice): boolean {
  return (
    invoice.currency === "MGA" &&
    (invoice.status === "sent" || invoice.status === "overdue") &&
    invoice.total - invoice.amountPaid >= PAPI_MIN_AMOUNT
  );
}

type Deps = { store?: PapiStore; provider?: PaymentProvider; now?: Date };

function defaultStore(): PapiStore | null {
  const admin = createAdminClient();
  return admin ? papiStore(admin) : null;
}

// Lien payable de la facture : le lien actif s'il est encore valable, sinon (expiré,
// désactivé, montant changé) un nouveau lien avec la référence IVN-<facture>-<tentative>.
export async function ensureInvoicePapiLink(
  invoice: PayableInvoice,
  { origin, store = defaultStore() ?? undefined, provider = papi, now = new Date() }: { origin: string } & Deps,
): Promise<LinkOutcome> {
  if (!isPapiEligible(invoice)) return { status: "skipped" };
  if (!store) return { status: "failed", reason: "disabled" };

  let account: PapiAccount | null;
  try {
    account = await store.getAccount(invoice.workspaceId);
  } catch (error) {
    if (error instanceof SecretsUnavailableError) return { status: "failed", reason: "disabled" };
    throw error;
  }
  if (!account) return { status: "skipped" };
  const due = invoice.total - invoice.amountPaid;
  const unauthorized = async (): Promise<LinkOutcome> => {
    await store.markNeedsReconnect(invoice.workspaceId);
    return { status: "failed", reason: "unauthorized" };
  };

  const links = await store.listLinks(invoice.id);
  const latest = links[0];
  if (latest?.status === "active" && latest.url) {
    const fresh = !latest.expiresAt || latest.expiresAt.getTime() > now.getTime() + EXPIRY_MARGIN_MS;
    if (fresh && latest.amount === due) return { status: "ready", url: latest.url };
    // Avant d'en émettre un autre, relire le lien (doc) : il a peut-être été payé.
    const state = await provider.getLinkStatus(account.apiKey, latest.reference);
    if (state.ok) {
      const applied = await applyLinkState(store, latest.reference, state.value);
      if (applied === "recorded" || applied === "duplicate") return { status: "paid" };
    } else if (state.error === "unauthorized") {
      return unauthorized();
    }
    // Expiré ou bientôt, ou montant changé : l'ancien lien n'est plus proposé. S'il est
    // payé quand même, sa notification reste vérifiée et le rattrapage le relit.
    await store.closeLink(latest.reference, "cancelled");
  }

  const attempt = links.length + 1;
  const reference = `IVN-${invoice.id}-${attempt}`;
  const newLink = {
    workspaceId: invoice.workspaceId,
    invoiceId: invoice.id,
    accountId: account.id,
    reference,
    amount: due,
    apiKey: account.apiKey,
    signingSecret: account.signingSecret,
  };
  const label = invoice.number ? `${INVOICE_LABEL[invoice.language]} ${invoice.number}` : INVOICE_LABEL[invoice.language];
  const created = await provider.createLink(account.apiKey, {
    amount: due,
    reference,
    clientName: invoice.clientName || invoice.businessName,
    description: `${label} · ${invoice.businessName}`,
    successUrl: `${invoice.publicUrl}?paiement=ok`,
    failureUrl: `${invoice.publicUrl}?paiement=echec`,
    notificationUrl: `${origin}/api/papi/notification`,
    validDurationHours: PAPI_VALID_HOURS,
  });
  if (!created.ok) {
    console.error(`[papi] lien non créé (${created.error}) pour ${reference}`);
    if (created.error === "unauthorized") return unauthorized();
    if (created.error === "conflict") {
      // Référence déjà prise chez Papi avec un autre montant (lien créé là-bas mais pas
      // enregistré ici) : tentative notée, la prochaine prend la référence suivante.
      await store.insertLink({ ...newLink, status: "failed", url: null, notificationToken: null, expiresAt: null });
    }
    return { status: "failed", reason: created.error === "not_found" ? "unavailable" : created.error };
  }

  // Deux ouvertures simultanées : même référence, Papi renvoie le même lien (idempotent).
  await store.insertLink({
    ...newLink,
    status: "active",
    url: created.value.url,
    notificationToken: created.value.notificationToken,
    expiresAt: created.value.expiresAt,
  });
  return { status: "ready", url: created.value.url };
}

// Applique la relecture d'un lien : payé → paiement enregistré (idempotent) ; expiré ou
// désactivé → lien fermé. Renvoie le résultat de l'enregistrement s'il y en a eu un.
async function applyLinkState(store: PapiStore, reference: string, state: LinkState): Promise<RecordResult | null> {
  if (state.linkStatus === "PAID" && state.paymentStatus === "SUCCESS" && state.providerReference && state.amount !== null) {
    return store.recordPayment({
      merchantReference: reference,
      providerReference: state.providerReference,
      amount: state.amount,
      // Les frais ne figurent que dans la notification (complétés si elle arrive ensuite).
      fee: 0,
      method: state.method ?? "manual",
    });
  }
  if (state.linkStatus === "EXPIRED" || state.linkStatus === "DISABLED") {
    await store.closeLink(reference, state.linkStatus === "EXPIRED" ? "expired" : "cancelled");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notification et rattrapage
// ---------------------------------------------------------------------------

// Au-delà de ce nombre de notifications non authentiques en une heure, les suivantes ne sont
// plus enregistrées avant vérification (table remplie à volonté sinon). Une notification
// correctement signée est toujours vérifiée, enregistrée et traitée.
const UNVERIFIED_EVENTS_PER_HOUR = 500;

export function notificationStore(admin: AdminClient): NotificationStore {
  return {
    async acceptingEvents(now) {
      const { count } = await check(
        admin
          .from("webhook_events")
          .select("id", { count: "exact", head: true })
          .not("signature_valid", "is", true)
          .gte("created_at", new Date(now.getTime() - 3600_000).toISOString()),
      );
      return (count ?? 0) < UNVERIFIED_EVENTS_PER_HOUR;
    },
    async saveEvent(rawBody, payload) {
      const { data } = await check(
        admin
          .from("webhook_events")
          .insert({ provider: "papi", raw_body: rawBody, payload: payload as never })
          .select("id")
          .single(),
      );
      return data.id;
    },
    async findLink(reference) {
      const { data: link } = await check(
        admin
          .from("payment_links")
          .select("workspace_id, payment_account_id, notification_token, encrypted_signing_secret")
          .eq("provider", "papi")
          .eq("merchant_reference", reference)
          .maybeSingle(),
      );
      if (!link) return null;
      const { data: account } = await check(
        admin.from("payment_accounts").select("encrypted_signing_secret").eq("id", link.payment_account_id).maybeSingle(),
      );
      // Secret gardé sur le lien (celui de sa création), puis le secret actuel du compte
      // (secret régénéré dans la même boutique).
      const secrets = [
        link.encrypted_signing_secret &&
          decryptSecret(link.encrypted_signing_secret, linkSecretAad(link.workspace_id, "papi", reference, "signing_secret")),
        account?.encrypted_signing_secret &&
          decryptSecret(account.encrypted_signing_secret, secretAad(link.workspace_id, "papi", "signing_secret")),
      ].filter((s): s is string => Boolean(s));
      return { notificationToken: link.notification_token, signingSecrets: [...new Set(secrets)] };
    },
    recordPayment: (input) => recordPapiPayment(admin, input),
    async finishEvent(id, { signatureValid, error }) {
      await check(
        admin
          .from("webhook_events")
          .update({ signature_valid: signatureValid, error, processed_at: new Date().toISOString() })
          .eq("id", id),
      );
    },
  };
}

export type SyncResult = { checked: number; paid: number; closed: number; failed: number; stopped: boolean };

// Rattrapage quotidien : relit les liens encore payables chez Papi (notification perdue) et
// applique leur statut. Liens actifs, et liens annulés localement (remplacés, facture
// annulée, Papi déconnecté ou clé remplacée) tant qu'ils ne sont pas expirés, relus avec la
// clé qui les a créés (copie gardée sur le lien), puis la clé actuelle du compte (clé
// régénérée dans la même boutique). Les moins récemment relus
// d'abord : un lien qui échoue toujours passe en fin de file au lieu de bloquer les autres.
// S'arrête avant `budgetMs` (durée d'une fonction Vercel).
export async function syncOpenPapiLinks(
  store: PapiStore,
  { limit = 100, budgetMs = 40_000, provider = papi, now = new Date() }: { limit?: number; budgetMs?: number; provider?: PaymentProvider; now?: Date } = {},
): Promise<SyncResult> {
  const started = Date.now();
  const cutoff = new Date(now.getTime() - LINK_GRACE_MS);
  await store.closeStaleLinks(cutoff);
  await store.purgeUnverifiedEvents(new Date(now.getTime() - UNVERIFIED_EVENTS_RETENTION_MS));
  const links = await store.linksToCheck(limit, cutoff);

  const result: SyncResult = { checked: 0, paid: 0, closed: 0, failed: 0, stopped: false };
  const accounts = new Map<string, PapiAccount | null>();
  // Clés refusées par Papi pendant ce passage : pas réessayées sur les autres liens.
  const refused = new Set<string>();
  for (const link of links) {
    if (Date.now() - started > budgetMs) {
      result.stopped = true;
      break;
    }
    try {
      if (!accounts.has(link.workspaceId)) accounts.set(link.workspaceId, await store.getAccount(link.workspaceId));
      const account = accounts.get(link.workspaceId);
      const keys = [...new Set([link.apiKey, account?.apiKey])].filter((key): key is string => !!key && !refused.has(key));
      if (keys.length === 0) {
        // Aucune clé utilisable : relu plus tard, après les autres.
        await store.touchLink(link.reference, null);
        continue;
      }
      let state: ProviderResult<LinkState> = { ok: false, error: "unauthorized" };
      for (const key of keys) {
        state = await provider.getLinkStatus(key, link.reference);
        if (state.ok || state.error !== "unauthorized") break;
        refused.add(key);
        if (key === account?.apiKey) {
          await store.markNeedsReconnect(link.workspaceId);
          accounts.set(link.workspaceId, null);
        }
      }
      result.checked += 1;
      if (!state.ok) {
        result.failed += 1;
        await store.touchLink(link.reference, null);
        continue;
      }
      const recorded = await applyLinkState(store, link.reference, state.value);
      if (recorded === "recorded") result.paid += 1;
      else if (recorded === "amount_mismatch" || recorded === "not_payable") result.failed += 1;
      else if (link.status === "active" && (state.value.linkStatus === "EXPIRED" || state.value.linkStatus === "DISABLED")) {
        result.closed += 1;
      }
      await store.touchLink(link.reference, null);
    } catch (cause) {
      result.failed += 1;
      console.error("[papi] rattrapage : lien non relu", link.reference, cause instanceof Error ? cause.message : "");
      await store.touchLink(link.reference, "sync_failed").catch(() => undefined);
    }
  }
  return result;
}
