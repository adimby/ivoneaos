-- Paiements : montant encaissé recalculé, privilèges par colonne, droits d'exécution.

-- ---------------------------------------------------------------------------
-- Un paiement met à jour amount_paid de sa facture ; la facture passe à « payée »
-- quand le total est couvert. Même devise que la facture, facture émise uniquement.
-- Le navigateur n'écrit que des paiements manuels (politiques RLS de payments).
-- ---------------------------------------------------------------------------
create function public.payments_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inv record;
  already_paid bigint;
begin
  select i.status, i.currency, i.total into inv
  from public.invoices i
  where i.id = new.invoice_id
  for update;

  if inv.status is null then
    return new; -- refusé ensuite par RLS ou la clé étrangère
  end if;
  if inv.status not in ('sent', 'overdue', 'paid') then
    raise exception 'invoice_not_payable' using errcode = '55000';
  end if;
  if new.currency <> inv.currency then
    raise exception 'currency_mismatch' using errcode = '55000';
  end if;

  -- Paiement manuel (saisi à la main) : ni daté dans le futur, ni au-delà du reste dû
  -- (une faute de frappe gonflerait l'encaissé). Les paiements Papi / Whop sont de
  -- l'argent réellement reçu : toujours enregistrés, même en trop-perçu.
  if new.provider = 'manual' then
    if new.paid_at > now() + interval '1 day' then
      raise exception 'payment_date_in_future' using errcode = '55000';
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

-- Après un paiement : « touche » la facture, dont la garde recalcule amount_paid,
-- paid_at et le statut payé (y compris le retour à envoyée si un paiement est supprimé).
create function public.payments_sync_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    update public.invoices set updated_at = now() where id = old.invoice_id;
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.invoice_id <> old.invoice_id) then
    update public.invoices set updated_at = now() where id = new.invoice_id;
  end if;
  return null;
end;
$$;

create trigger t10_check before insert or update on public.payments
  for each row execute function public.payments_check();
create trigger t50_sync_invoice after insert or update or delete on public.payments
  for each row execute function public.payments_sync_invoice();

-- ---------------------------------------------------------------------------
-- Privilèges. Supabase accorde par défaut tout à anon et authenticated : on
-- resserre. anon n'atteint aucune table, seulement les 3 fonctions publiques.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
-- TRUNCATE ignore la RLS : jamais pour le navigateur.
revoke truncate, references, trigger on all tables in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
-- PostgreSQL accorde EXECUTE à PUBLIC sur toute nouvelle fonction (défaut global,
-- non restreignable au schéma) : chaque migration qui crée une fonction doit
-- faire « revoke execute … from public, anon » puis accorder ce qu'il faut.

-- Profil : created_at (date d'inscription, base de la garantie 90 jours) n'est jamais
-- réécrit par le navigateur. La ligne est créée à l'inscription (handle_new_user).
revoke insert, update on public.profiles from authenticated;
grant insert (user_id, full_name, phone, locale) on public.profiles to authenticated;
grant update (full_name, phone, locale) on public.profiles to authenticated;

-- Écritures gérées par des fonctions ou par le serveur (plan compris : jamais par le navigateur).
revoke insert, update, delete on public.workspaces from authenticated;
grant update (name, trade, level, default_currency, nif, stat, tax_regime, address, logo_path, invoice_footer)
  on public.workspaces to authenticated;
revoke insert, update, delete on public.workspace_members from authenticated;
revoke insert, update, delete on public.number_sequences from authenticated;
revoke all on public.webhook_events from authenticated;

-- Contacts et opportunités : archivés (archived_at), jamais supprimés par le navigateur.
revoke delete on public.contacts, public.deals from authenticated;

-- Étapes : nom et position seulement (kind fixe : gagné / perdu ne se transforment pas).
revoke update on public.pipeline_stages from authenticated;
grant update (name, position) on public.pipeline_stages to authenticated;

-- Devis et factures : numéro, jeton, totaux, dates d'émission, copie figée et montant
-- encaissé sont posés par les triggers. updated_at sert au recalcul (lignes, paiements).
revoke insert, update on public.quotes, public.invoices from authenticated;
grant insert (workspace_id, contact_id, deal_id, currency, valid_until, discount)
  on public.quotes to authenticated;
grant update (contact_id, deal_id, currency, valid_until, discount, status, pdf_path, updated_at)
  on public.quotes to authenticated;
grant insert (workspace_id, contact_id, quote_id, currency, exchange_rate, due_on, discount)
  on public.invoices to authenticated;
grant update (contact_id, quote_id, currency, exchange_rate, due_on, discount, status, pdf_path, updated_at)
  on public.invoices to authenticated;

-- payment_links : créés et mis à jour par le serveur ; notification_token (vérification
-- du webhook) jamais lisible par le navigateur. Toujours lister les colonnes.
revoke all on public.payment_links from authenticated;
grant select (id, workspace_id, invoice_id, payment_account_id, provider, merchant_reference,
              provider_url, status, expires_at, created_at, updated_at)
  on public.payment_links to authenticated;

-- payment_accounts : les colonnes chiffrées ne sont lisibles que par le service role.
-- Côté navigateur, toujours lister les colonnes (select('*') est refusé).
revoke all on public.payment_accounts from authenticated;
grant select (id, workspace_id, provider, status, external_account_id, manual_instructions,
              last_checked_at, created_at, updated_at)
  on public.payment_accounts to authenticated;
grant insert (workspace_id, provider, manual_instructions) on public.payment_accounts to authenticated;
grant update (manual_instructions) on public.payment_accounts to authenticated;
grant delete on public.payment_accounts to authenticated;

-- Fonctions : rien n'est exécutable par défaut (PUBLIC inclus).
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.my_workspace_ids() to authenticated;
grant execute on function public.create_workspace(text, public.currency, text) to authenticated;
-- Valeur par défaut de public_token : évaluée avec les droits de l'appelant.
grant execute on function public.generate_public_token() to authenticated;
grant execute on function public.get_public_quote(text) to anon, authenticated;
grant execute on function public.get_public_invoice(text) to anon, authenticated;
grant execute on function public.accept_quote(text, text) to anon, authenticated;
-- Appelée par les gardes de devis et facture (droits de l'appelant, RLS appliquée).
grant execute on function public.document_snapshot(uuid, uuid) to authenticated;
