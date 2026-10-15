-- Paiement Papi (parcours P2, P5 étapes 5 à 7). Doc : https://docs.papi.mg/fr/docs/developper-guide/integration-guide
--   1. payment_links : montant demandé à Papi (un paiement notifié doit lui être égal),
--      copies chiffrées de la clé API et du secret de signature valables à la création du
--      lien (après un remplacement de clé ou une déconnexion, la notification d'un lien reste
--      vérifiable et le rattrapage le relit encore), date de dernière relecture et dernière
--      anomalie (affichée à la freelance).
--   2. record_papi_payment : enregistre un paiement Papi vérifié (notification signée ou
--      relecture du lien), idempotent sur la référence de paiement Papi. Service role seulement.
--      Un paiement qui ne peut pas être enregistré (montant différent, facture non payable)
--      est signalé sur le lien au lieu d'être réessayé sans fin.
--   3. get_public_invoice : indique si le paiement Papi est proposé (papi_available) ;
--      la page publique crée ou recrée alors le lien à la demande.
--   4. webhook_events : index des notifications non vérifiées (limite de débit, purge).

-- ---------------------------------------------------------------------------
-- 1. Montant du lien
-- ---------------------------------------------------------------------------
alter table public.payment_links
  add column amount bigint check (amount > 0),
  -- Chiffrés côté serveur (AES-256-GCM), effacés par le rattrapage après l'expiration du lien.
  add column encrypted_api_key text,
  add column encrypted_signing_secret text,
  add column last_checked_at timestamptz,
  -- Anomalie : 'amount_mismatch', 'not_payable' (montrées à la freelance), 'sync_failed'
  -- (relecture en échec), 'conflict' (tentative refusée par Papi, référence non réutilisée).
  add column last_error text check (char_length(last_error) <= 200);

-- Lecture par la propriétaire (colonnes listées : notification_token et les secrets chiffrés
-- toujours exclus).
grant select (amount, last_error) on public.payment_links to authenticated;

-- Rattrapage : liens ouverts (ou annulés mais encore payables chez Papi), les moins
-- récemment relus d'abord.
create index payment_links_recheck_idx on public.payment_links (provider, last_checked_at nulls first)
  where status in ('active', 'cancelled');

create index webhook_events_unverified_idx on public.webhook_events (created_at)
  where signature_valid is not true;

-- ---------------------------------------------------------------------------
-- 2. Paiement Papi vérifié
-- Résultat : 'recorded' (paiement enregistré, facture recalculée par les triggers de
-- payments ; même sur un lien annulé localement, car Papi ne permet pas de désactiver un
-- lien : l'argent est réellement reçu, un trop-perçu s'affiche sur la facture),
-- 'duplicate' (même paiement déjà reçu : notification rejouée ou relecture ; les frais
-- manquants d'un paiement rattrapé sont complétés), 'unknown_link' (référence inconnue),
-- 'amount_mismatch' (montant différent du lien) ou 'not_payable' (paiement refusé par la
-- facture) : rien n'est enregistré, le lien passe à 'failed' avec l'anomalie, montrée à la
-- freelance, et n'est plus relu.
-- ---------------------------------------------------------------------------
create function public.record_papi_payment(
  p_merchant_reference text,
  p_provider_reference text,
  p_amount bigint,
  p_fee bigint,
  p_method public.payment_method,
  p_paid_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
  inv_currency public.currency;
  inserted uuid;
begin
  if nullif(btrim(p_provider_reference), '') is null then
    raise exception 'provider_reference_required' using errcode = '22023';
  end if;

  select pl.id, pl.workspace_id, pl.invoice_id, pl.amount, pl.status into link
  from public.payment_links pl
  where pl.provider = 'papi' and pl.merchant_reference = p_merchant_reference
  for update;
  if link.id is null then
    return 'unknown_link';
  end if;

  -- Idempotence d'abord : un paiement déjà reçu reste « duplicate », quel que soit le reste.
  -- Rattrapé par relecture (frais inconnus, 0), il reçoit les frais de la notification.
  if exists (
    select 1 from public.payments p where p.provider = 'papi' and p.provider_reference = p_provider_reference
  ) then
    update public.payments p
    set fee = p_fee
    where p.provider = 'papi' and p.provider_reference = p_provider_reference
      and p.fee = 0 and coalesce(p_fee, 0) > 0;
    return 'duplicate';
  end if;

  if link.amount is null or p_amount is distinct from link.amount then
    update public.payment_links
    set status = case when status in ('active', 'cancelled') then 'failed'::public.payment_link_status else status end,
        last_error = 'amount_mismatch'
    where id = link.id;
    return 'amount_mismatch';
  end if;

  select i.currency into inv_currency from public.invoices i where i.id = link.invoice_id;

  begin
    insert into public.payments (
      workspace_id, invoice_id, payment_link_id, provider, method, amount, fee, currency, provider_reference, paid_at
    )
    values (
      link.workspace_id, link.invoice_id, link.id, 'papi', p_method, p_amount, greatest(coalesce(p_fee, 0), 0),
      inv_currency, p_provider_reference, coalesce(p_paid_at, now())
    )
    on conflict (provider, provider_reference) do nothing
    returning id into inserted;
  exception when sqlstate '55000' then
    -- Refus de payments_check (invoice_not_payable, currency_mismatch) : définitif, une
    -- nouvelle tentative échouerait pareil. Signalé sur le lien, pas réessayé.
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

revoke execute on function public.record_papi_payment(text, text, bigint, bigint, public.payment_method, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_papi_payment(text, text, bigint, bigint, public.payment_method, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Page publique : paiement Papi proposé si la freelance a connecté Papi, que la
-- facture est en ariary et que le reste dû atteint le minimum Papi (300 Ar).
-- ---------------------------------------------------------------------------
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
      )
    ) end
  )
  from public.invoices i
  where i.public_token = get_public_invoice.token
    and i.status <> 'draft';
$$;
