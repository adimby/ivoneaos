-- Corrections de la revue : logos en ajout seul, annulation des liens à l'annulation
-- d'une facture, paiement fournisseur sur facture annulée, date d'un paiement manuel.
begin;
\ir helpers.psql
select plan(18);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
reset role;

update public.workspaces set nif = '1234567890', stat = '12345112026000001', tax_regime = 'tva', plan = 'lancement'
where id = :'wa';
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000') returning id as ca \gset

-- ---------------------------------------------------------------------------
-- 1. Logos : 1 Mo, ajouts seulement, logo d'un document émis intouchable.
-- ---------------------------------------------------------------------------
select is((select file_size_limit from storage.buckets where id = 'logos'), 1048576::bigint,
  'bucket logos : 1 Mo au plus');

select tests.authenticate_as(:'alice');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wa' || '/logo-1.png'),
  'Alice envoie un premier logo');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where bucket_id = 'logos' and name = %L $$, :'wa' || '/logo-1.png')), 0,
  'un logo déposé n''est pas remplacé');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wa' || '/logo-2.png'),
  'nouvel envoi : nouveau nom versionné');
update public.workspaces set logo_path = :'wa' || '/logo-2.png' where id = :'wa';

-- Facture émise avec logo-2 dans sa copie figée.
select tests.new_invoice(:'wa', :'ca', 450000) as inv \gset
update public.invoices set status = 'sent' where id = :'inv';
select is(public.is_public_logo(:'wa' || '/logo-2.png'), true, 'logo-2 figure sur une facture émise');

select set_config('storage.allow_delete_query', 'true', true);
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'logos' and name = %L $$, :'wa' || '/logo-2.png')), 0,
  'logo d''un document émis : non supprimable');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where bucket_id = 'logos' and name = %L $$, :'wa' || '/logo-2.png')), 0,
  'logo d''un document émis : non remplaçable');
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'logos' and name = %L $$, :'wa' || '/logo-1.png')), 1,
  'ancien logo jamais utilisé sur un document émis : supprimable (ménage)');

select tests.authenticate_as(:'bob');
select set_config('storage.allow_delete_query', 'true', true);
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'logos' and name like %L $$, :'wa' || '/%')), 0,
  'Bob ne supprime pas les logos d''Alice');

-- ---------------------------------------------------------------------------
-- 2. Annulation : liens actifs annulés, les autres inchangés.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
insert into public.payment_accounts (workspace_id, provider, status, encrypted_api_key, encrypted_signing_secret)
values (:'wa', 'papi', 'connected', 'v1:x', 'v1:y') returning id as pa \gset
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, status)
values (:'wa', :'inv', :'pa', 'papi', 'IVN-A-1', 'expired') returning id as link_expired \gset
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_url)
values (:'wa', :'inv', :'pa', 'papi', 'IVN-A-2', 'https://app.papi.mg/pay/a2') returning id as link_active \gset

select tests.authenticate_as(:'alice');
update public.invoices set status = 'cancelled' where id = :'inv';
select is((select status::text from public.payment_links where id = :'link_active'), 'cancelled',
  'facture annulée : son lien actif est annulé');
select is((select status::text from public.payment_links where id = :'link_expired'), 'expired',
  'les liens déjà clos ne changent pas');

-- ---------------------------------------------------------------------------
-- 3. Paiement fournisseur sur facture annulée : enregistré, statut inchangé.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
select lives_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, payment_link_id, provider, method, amount, currency, provider_reference)
            values (%L, %L, %L, 'papi', 'MVOLA', 450000, 'MGA', 'PAPI-LATE') $$, :'wa', :'inv', :'link_active'),
  'paiement Papi reçu sur une facture annulée : enregistré (argent réellement reçu)');
select is((select row(status::text, amount_paid, paid_at) from public.invoices where id = :'inv'),
  row('cancelled'::text, 450000::bigint, null::timestamptz),
  'la facture reste annulée, le montant encaissé est à jour');

select tests.authenticate_as(:'alice');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'MVOLA', 1000, 'MGA') $$, :'wa', :'inv'),
  '55000', 'invoice_not_payable', 'paiement manuel sur une facture annulée : refusé');

select tests.new_invoice(:'wa', :'ca', 100000) as draft_inv \gset
select tests.as_service_role();
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, provider_reference) values (%L, %L, 'papi', 'MVOLA', 1000, 'MGA', 'PAPI-DRAFT') $$, :'wa', :'draft_inv'),
  '55000', 'invoice_not_payable', 'paiement fournisseur sur un brouillon : refusé');

-- ---------------------------------------------------------------------------
-- 4. Paiement manuel : pas daté de plus d'un jour avant l'envoi de la facture.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select tests.new_invoice(:'wa', :'ca', 100000) as inv2 \gset
update public.invoices set status = 'sent' where id = :'inv2';
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, paid_at) values (%L, %L, 'manual', 'manual', 1000, 'MGA', now() - interval '2 days') $$, :'wa', :'inv2'),
  '55000', 'payment_date_before_invoice', 'paiement manuel daté de plus d''un jour avant l''envoi : refusé');
select lives_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, paid_at) values (%L, %L, 'manual', 'manual', 1000, 'MGA', now() - interval '20 hours') $$, :'wa', :'inv2'),
  'paiement manuel reçu la veille de l''envoi : accepté (un jour de marge)');
select tests.as_service_role();
select lives_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, provider_reference, paid_at) values (%L, %L, 'papi', 'MVOLA', 1000, 'MGA', 'PAPI-OLD', now() - interval '3 days') $$, :'wa', :'inv2'),
  'paiement fournisseur : sa date vient du fournisseur, non contrôlée');

select * from finish();
rollback;
