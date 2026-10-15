-- Corrections issues de la revue de la base :
--   1. Logos : ajouts seulement (un nom versionné à chaque envoi), 1 Mo au plus ; un logo
--      figurant dans un document émis (is_public_logo) n'est jamais remplacé ni supprimé.
--   2. Facture annulée : ses liens de paiement actifs sont annulés.
--   3. Paiement Papi / Whop reçu sur une facture annulée : enregistré (l'argent est
--      réellement arrivé), sans changer le statut de la facture.
--   4. Paiement manuel : pas daté de plus d'un jour avant l'envoi de la facture
--      (payment_date_before_invoice, code 55000, traduit dans errors.db.*).

-- ---------------------------------------------------------------------------
-- 1. Logos
-- ---------------------------------------------------------------------------
update storage.buckets set file_size_limit = 1024 * 1024 where id = 'logos';

-- Pas de remplacement : chaque envoi crée un fichier au nom nouveau
-- (« <workspace_id>/logo-<horodatage>.<ext> »), la copie figée d'un document émis
-- continue de pointer vers l'ancien.
drop policy "workspace_logo_update" on storage.objects;

-- Suppression d'un ancien logo (ménage) seulement s'il n'apparaît dans aucun document émis.
drop policy "workspace_logo_delete" on storage.objects;
create policy "workspace_logo_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select w::text from public.my_workspace_ids() w)
    and not public.is_public_logo(name)
  );

-- ---------------------------------------------------------------------------
-- 2. Annulation d'une facture : ses liens actifs ne doivent plus encaisser.
-- SECURITY DEFINER : le navigateur annule la facture mais n'écrit pas payment_links.
-- ---------------------------------------------------------------------------
create function public.invoices_cancel_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_links pl
  set status = 'cancelled'
  where pl.invoice_id = new.id
    and pl.workspace_id = new.workspace_id
    and pl.status = 'active';
  return null;
end;
$$;

revoke execute on function public.invoices_cancel_links() from public, anon, authenticated;

create trigger t50_cancel_links after update of status on public.invoices
  for each row
  when (new.status = 'cancelled' and old.status <> 'cancelled')
  execute function public.invoices_cancel_links();

-- ---------------------------------------------------------------------------
-- 3 et 4. Contrôle des paiements.
-- ---------------------------------------------------------------------------
create or replace function public.payments_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inv record;
  already_paid bigint;
begin
  select i.status, i.currency, i.total, i.sent_at into inv
  from public.invoices i
  where i.id = new.invoice_id
  for update;

  if inv.status is null then
    return new; -- refusé ensuite par RLS ou la clé étrangère
  end if;
  -- Facture annulée : un paiement Papi / Whop est de l'argent réellement reçu (lien
  -- ouvert avant l'annulation) ; il est enregistré, la facture reste annulée.
  if inv.status not in ('sent', 'overdue', 'paid')
     and not (inv.status = 'cancelled' and new.provider <> 'manual') then
    raise exception 'invoice_not_payable' using errcode = '55000';
  end if;
  if new.currency <> inv.currency then
    raise exception 'currency_mismatch' using errcode = '55000';
  end if;

  -- Paiement manuel (saisi à la main) : ni daté dans le futur, ni d'avant l'envoi de la
  -- facture (un jour de marge), ni au-delà du reste dû (une faute de frappe gonflerait
  -- l'encaissé). Les paiements Papi / Whop sont toujours enregistrés, même en trop-perçu.
  if new.provider = 'manual' then
    if new.paid_at > now() + interval '1 day' then
      raise exception 'payment_date_in_future' using errcode = '55000';
    end if;
    if new.paid_at < inv.sent_at - interval '1 day' then
      raise exception 'payment_date_before_invoice' using errcode = '55000';
    end if;
    -- La facture est verrouillée ci-dessus : deux saisies simultanées se suivent.
    select coalesce(sum(p.amount), 0)::bigint into already_paid
    from public.payments p
    where p.invoice_id = new.invoice_id and p.id <> new.id;
    if already_paid + new.amount > inv.total then
      raise exception 'payment_exceeds_balance' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.payments_check() from public, anon, authenticated;
