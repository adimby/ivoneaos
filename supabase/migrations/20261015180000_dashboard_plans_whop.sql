-- Tableau de bord, offres, indicateurs de la garantie 90 jours et Whop (factures EUR/USD).
--   1. dashboard_invoice_totals : encaissé ce mois-ci et factures en attente, regroupés par
--      devise et taux (conversion dans la devise par défaut côté serveur, module dashboard).
--      Droits de l'appelant : RLS appliquée.
--   2. plan_usage : contacts actifs et documents envoyés ce mois-ci (mêmes règles que
--      contacts_plan_limit et next_document_number). Droits de l'appelant.
--   3. guarantee_workspaces, guarantee_weekly : indicateurs de la garantie 90 jours, lisibles
--      par le service role seulement (Ivonea), jamais par le navigateur.
--   4. Whop : identifiant de la configuration de paiement sur le lien, record_whop_payment
--      et flag_whop_link (service role seulement), whop_available sur la page publique.
--   5. Devise par défaut changée : taux des brouillons en autre devise remis à 1 (à ressaisir).

-- ---------------------------------------------------------------------------
-- 1. Tableau de bord
-- ---------------------------------------------------------------------------
-- kind 'collected' : paiements reçus ce mois-ci (heure d'Antananarivo), quel que soit
-- l'état de la facture (argent réellement reçu), au taux de leur facture.
-- kind 'pending' : reste dû des factures envoyées ; overdue = échéance passée.
-- Devise et taux renvoyés tels quels : jamais d'addition de devises différentes ici.
create function public.dashboard_invoice_totals(p_workspace_id uuid)
returns table (
  kind text,
  currency public.currency,
  exchange_rate numeric,
  overdue boolean,
  item_count integer,
  amount bigint
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      (now() at time zone 'Indian/Antananarivo')::date as today,
      date_trunc('month', now() at time zone 'Indian/Antananarivo') at time zone 'Indian/Antananarivo' as month_start,
      (date_trunc('month', now() at time zone 'Indian/Antananarivo') + interval '1 month')
        at time zone 'Indian/Antananarivo' as month_end
  )
  select 'collected', p.currency, i.exchange_rate, false, count(*)::integer, sum(p.amount)::bigint
  from public.payments p
  join public.invoices i on i.workspace_id = p.workspace_id and i.id = p.invoice_id
  cross join bounds b
  where p.workspace_id = p_workspace_id
    and p.paid_at >= b.month_start
    and p.paid_at < b.month_end
  group by p.currency, i.exchange_rate
  union all
  select 'pending', i.currency, i.exchange_rate, coalesce(i.due_on < b.today, false),
         count(*)::integer, sum(i.total - i.amount_paid)::bigint
  from public.invoices i
  cross join bounds b
  where i.workspace_id = p_workspace_id
    and i.status in ('sent', 'overdue')
    and i.total > i.amount_paid
  group by i.currency, i.exchange_rate, coalesce(i.due_on < b.today, false);
$$;
revoke execute on function public.dashboard_invoice_totals(uuid) from public, anon;
grant execute on function public.dashboard_invoice_totals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Offres : usage du mois (affiché dans Réglages > Offre, contrôlé avant l'action).
-- La base reste juge (contacts_plan_limit, next_document_number) : mêmes définitions.
-- ---------------------------------------------------------------------------
create function public.plan_usage(p_workspace_id uuid)
returns table (active_contacts integer, documents_this_month integer)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', now() at time zone 'Indian/Antananarivo') at time zone 'Indian/Antananarivo' as month_start
  )
  select
    (select count(*) from public.contacts c
     where c.workspace_id = p_workspace_id and c.archived_at is null)::integer,
    ((select count(*) from public.quotes q, bounds b
      where q.workspace_id = p_workspace_id and q.sent_at >= b.month_start)
     + (select count(*) from public.invoices i, bounds b
        where i.workspace_id = p_workspace_id and i.sent_at >= b.month_start))::integer;
$$;
revoke execute on function public.plan_usage(uuid) from public, anon;
grant execute on function public.plan_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Garantie 90 jours (docs/spec-mvp.md) : à lire par Ivonea avec la clé serveur
-- (SQL ou REST). Vues aux droits de leur propriétaire : jamais accordées au navigateur.
-- ---------------------------------------------------------------------------
create view public.guarantee_workspaces as
select
  w.id as workspace_id,
  w.name,
  w.plan,
  m.user_id as owner_id,
  p.created_at as signed_up_at,
  w.profile_completed_at,
  (select min(q.sent_at) from public.quotes q where q.workspace_id = w.id) as first_quote_sent_at,
  (select count(*) from public.quotes q where q.workspace_id = w.id and q.sent_at is not null)::integer as quotes_sent,
  (select count(*) from public.invoices i where i.workspace_id = w.id and i.sent_at is not null)::integer as invoices_sent
from public.workspaces w
join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
join public.profiles p on p.user_id = m.user_id;

-- Par semaine (lundi, heure d'Antananarivo) : prospects contactés (contacts distincts
-- touchés par un appel, un WhatsApp, un e-mail ou un rendez-vous), échanges, devis et
-- factures envoyés.
create view public.guarantee_weekly as
with events as (
  select a.workspace_id,
         date_trunc('week', a.occurred_at at time zone 'Indian/Antananarivo')::date as week_start,
         count(distinct a.contact_id) as prospects_contacted,
         count(*) as touchpoints,
         0::bigint as quotes_sent,
         0::bigint as invoices_sent
  from public.activities a
  where a.kind in ('call', 'whatsapp', 'email', 'meeting')
  group by 1, 2
  union all
  select q.workspace_id, date_trunc('week', q.sent_at at time zone 'Indian/Antananarivo')::date, 0, 0, count(*), 0
  from public.quotes q
  where q.sent_at is not null
  group by 1, 2
  union all
  select i.workspace_id, date_trunc('week', i.sent_at at time zone 'Indian/Antananarivo')::date, 0, 0, 0, count(*)
  from public.invoices i
  where i.sent_at is not null
  group by 1, 2
)
select workspace_id, week_start,
       sum(prospects_contacted)::integer as prospects_contacted,
       sum(touchpoints)::integer as touchpoints,
       sum(quotes_sent)::integer as quotes_sent,
       sum(invoices_sent)::integer as invoices_sent
from events
group by workspace_id, week_start;

revoke all on public.guarantee_workspaces, public.guarantee_weekly from public, anon, authenticated;
grant select on public.guarantee_workspaces, public.guarantee_weekly to service_role;

-- ---------------------------------------------------------------------------
-- 4. Whop : paiement par carte des factures EUR/USD sur le compte connecté de la freelance
-- (https://docs.whop.com/developer/platforms/collect-payments-for-connected-accounts).
-- payment_accounts (provider 'whop') : external_account_id = compte connecté (biz_…),
-- status 'pending' tant que l'inscription Whop n'est pas terminée, puis 'connected'.
-- payment_links (provider 'whop') : merchant_reference = IVW-<facture>-<tentative> (copiée
-- dans les métadonnées du paiement), provider_link_id = configuration de paiement (ch_…).
-- ---------------------------------------------------------------------------
alter table public.payment_links
  add column provider_link_id text check (char_length(provider_link_id) <= 200);
create unique index payment_links_provider_link_idx on public.payment_links (provider, provider_link_id)
  where provider_link_id is not null;

-- Paiement Whop vérifié (webhook payment.succeeded signé). Mêmes résultats que
-- record_papi_payment : 'recorded', 'duplicate', 'unknown_link', 'amount_mismatch'
-- (montant ou devise différents du lien), 'not_payable' ; et 'account_mismatch' (paiement
-- reçu sur un autre compte Whop que celui du lien). Service role seulement.
create function public.record_whop_payment(
  p_merchant_reference text,
  p_checkout_id text,
  p_account_id text,
  p_provider_reference text,
  p_amount bigint,
  p_currency public.currency,
  p_fee bigint,
  p_paid_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  account_ref text;
  inv_currency public.currency;
  inserted uuid;
begin
  if nullif(btrim(p_provider_reference), '') is null then
    raise exception 'provider_reference_required' using errcode = '22023';
  end if;

  select pl.id, pl.workspace_id, pl.invoice_id, pl.amount, pl.payment_account_id, pl.provider_link_id into link
  from public.payment_links pl
  where pl.provider = 'whop'
    and (pl.merchant_reference = p_merchant_reference
         or (p_merchant_reference is null and pl.provider_link_id = p_checkout_id))
  for update;
  -- Configuration de paiement (ch_…) exigée quand le lien en a une : un paiement sans
  -- elle, ou d'une autre configuration, ne vient pas de ce lien.
  if link.id is null
     or (link.provider_link_id is not null and p_checkout_id is distinct from link.provider_link_id) then
    return 'unknown_link';
  end if;

  if exists (
    select 1 from public.payments p where p.provider = 'whop' and p.provider_reference = p_provider_reference
  ) then
    return 'duplicate';
  end if;

  select a.external_account_id into account_ref from public.payment_accounts a where a.id = link.payment_account_id;
  -- Compte connecté exigé et égal à celui du lien : un paiement sans compte lisible, ou
  -- reçu sur le compte d'une autre freelance (mêmes métadonnées recopiées), est refusé.
  if p_account_id is null or account_ref is null or account_ref is distinct from p_account_id then
    return 'account_mismatch';
  end if;

  select i.currency into inv_currency from public.invoices i where i.id = link.invoice_id;
  if link.amount is null or p_amount is distinct from link.amount or p_currency is distinct from inv_currency then
    update public.payment_links
    set status = case when status in ('active', 'cancelled') then 'failed'::public.payment_link_status else status end,
        last_error = 'amount_mismatch'
    where id = link.id;
    return 'amount_mismatch';
  end if;

  begin
    insert into public.payments (
      workspace_id, invoice_id, payment_link_id, provider, method, amount, fee, currency, provider_reference, paid_at
    )
    values (
      link.workspace_id, link.invoice_id, link.id, 'whop', 'CARD', p_amount, greatest(coalesce(p_fee, 0), 0),
      inv_currency, p_provider_reference, coalesce(p_paid_at, now())
    )
    on conflict (provider, provider_reference) do nothing
    returning id into inserted;
  exception when sqlstate '55000' then
    update public.payment_links
    set status = case when status in ('active', 'cancelled') then 'failed'::public.payment_link_status else status end,
        last_error = 'not_payable'
    where id = link.id;
    return 'not_payable';
  end;

  if inserted is null then
    return 'duplicate';
  end if;

  update public.payment_links set status = 'paid', last_error = null where id = link.id;
  return 'recorded';
end;
$$;

revoke execute on function public.record_whop_payment(text, text, text, text, bigint, public.currency, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_whop_payment(text, text, text, text, bigint, public.currency, bigint, timestamptz)
  to service_role;

-- Paiement Whop authentique mais non enregistrable, hors record_whop_payment ou refusé par
-- elle : devise autre que EUR/USD (currency_mismatch), montant illisible
-- (incomplete_payment), autre compte (account_mismatch) ou autre configuration
-- (unknown_link). Le client a pu être débité : l'anomalie est notée sur le lien retrouvé
-- (référence IVW-… des métadonnées, sinon configuration ch_…) pour être affichée sur la
-- facture. Débit dans une autre devise ou illisible : le lien passe en échec, comme pour
-- amount_mismatch. Renvoie false si aucun lien n'est retrouvé. Service role seulement
-- (appelée par le webhook avec l'une des quatre anomalies ci-dessus).
create function public.flag_whop_link(p_merchant_reference text, p_checkout_id text, p_error text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_links
  set last_error = p_error,
      status = case
        when p_error in ('currency_mismatch', 'incomplete_payment') and status in ('active', 'cancelled')
          then 'failed'::public.payment_link_status
        else status
      end
  where provider = 'whop'
    and (merchant_reference = p_merchant_reference
         or (p_merchant_reference is null and provider_link_id = p_checkout_id));
  return found;
end;
$$;

revoke execute on function public.flag_whop_link(text, text, text) from public, anon, authenticated;
grant execute on function public.flag_whop_link(text, text, text) to service_role;

-- Page publique : whop_available = la freelance a terminé son inscription Whop, la facture
-- est en euros ou en dollars et il reste à payer. Le serveur masque encore le bouton si
-- Whop n'est pas configuré (WHOP_API_KEY absente). Reprise de la version précédente
-- (migration papi) avec cette seule clé en plus.
create or replace function public.get_public_invoice(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'invoice',
    'number', i.number,
    'status', i.status,
    'language', i.language,
    'currency', i.currency,
    'issued_on', i.issued_on,
    'due_on', i.due_on,
    'paid_at', i.paid_at,
    'subtotal', i.subtotal,
    'discount', i.discount,
    'total', i.total,
    'amount_paid', i.amount_paid,
    'freelancer', i.snapshot -> 'freelancer',
    'client', i.snapshot -> 'client',
    'lines', public.document_public_lines(null, i.id),
    'payment', case when i.status in ('sent', 'overdue') then jsonb_build_object(
      'manual_instructions', (
        select a.manual_instructions
        from public.payment_accounts a
        where a.workspace_id = i.workspace_id and a.provider = 'manual'
      ),
      'payment_link_url', (
        select pl.provider_url
        from public.payment_links pl
        where pl.invoice_id = i.id
          and pl.status = 'active'
          and (pl.expires_at is null or pl.expires_at > now())
        order by pl.created_at desc
        limit 1
      ),
      'papi_available', (
        i.currency = 'MGA'
        and i.total - i.amount_paid >= 300
        and exists (
          select 1 from public.payment_accounts a
          where a.workspace_id = i.workspace_id and a.provider = 'papi' and a.status = 'connected'
        )
      ),
      'whop_available', (
        i.currency in ('EUR', 'USD')
        and i.total > i.amount_paid
        and exists (
          select 1 from public.payment_accounts a
          where a.workspace_id = i.workspace_id and a.provider = 'whop' and a.status = 'connected'
            and a.external_account_id is not null
        )
      )
    ) end
  )
  from public.invoices i
  where i.public_token = get_public_invoice.token
    and i.status <> 'draft';
$$;

-- ---------------------------------------------------------------------------
-- 5. Devise par défaut changée (permis tant qu'aucune facture n'est émise,
-- default_currency_locked) : le taux d'un brouillon en autre devise était exprimé vers
-- l'ancienne devise par défaut. Il est remis à 1 : l'émission exige alors un nouveau taux
-- (exchange_rate_required), et le tableau de bord ne convertit jamais avec un taux périmé.
-- ---------------------------------------------------------------------------
create function public.workspaces_reset_draft_rates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoices
  set exchange_rate = 1
  where workspace_id = new.id
    and status = 'draft'
    and currency <> new.default_currency
    and exchange_rate <> 1;
  return null;
end;
$$;

revoke execute on function public.workspaces_reset_draft_rates() from public, anon, authenticated;

create trigger t20_reset_draft_rates after update of default_currency on public.workspaces
  for each row when (new.default_currency is distinct from old.default_currency)
  execute function public.workspaces_reset_draft_rates();
