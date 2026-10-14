-- Paiements (colonnes chiffrées, idempotence, facture payée), webhook_events, Storage.
begin;
\ir helpers.psql
select plan(67);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
reset role;

update public.workspaces set nif = '1234567890', stat = '12345 11 2026 0 00001', tax_regime = 'tva', plan = 'lancement'
where id = :'wa';
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000') returning id as ca \gset
insert into public.invoices (workspace_id, contact_id) values (:'wa', :'ca') returning id as inv \gset
insert into public.document_lines (workspace_id, invoice_id, description, unit_price) values (:'wa', :'inv', 'Logo', 450000);
update public.invoices set status = 'sent' where id = :'inv';
insert into public.invoices (workspace_id, contact_id) values (:'wa', :'ca') returning id as draft_inv \gset
insert into public.invoices (workspace_id, contact_id) values (:'wa', :'ca') returning id as inv2 \gset
insert into public.document_lines (workspace_id, invoice_id, description, unit_price) values (:'wa', :'inv2', 'Carte', 100000);
update public.invoices set status = 'sent' where id = :'inv2';

-- ---------------------------------------------------------------------------
-- payment_accounts : secrets écrits par le serveur, jamais lus par authenticated.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
insert into public.payment_accounts (workspace_id, provider, status, encrypted_api_key, encrypted_signing_secret, last_checked_at)
values (:'wa', 'papi', 'connected', 'v1:iv:tag:cipher', 'v1:iv:tag:secret', now()) returning id as pa \gset
select is((select encrypted_api_key from public.payment_accounts where id = :'pa'), 'v1:iv:tag:cipher',
  'le service role lit les colonnes chiffrées');

select tests.authenticate_as(:'alice');
select is(
  (select row(provider::text, status::text) from public.payment_accounts where id = :'pa'),
  row('papi'::text, 'connected'::text),
  'la propriétaire voit fournisseur et statut'
);
select lives_ok(
  $$ select id, provider, status, external_account_id, manual_instructions, last_checked_at from public.payment_accounts $$,
  'colonnes non sensibles lisibles');
select throws_ok($$ select encrypted_api_key from public.payment_accounts $$, '42501', null,
  'encrypted_api_key illisible même pour la propriétaire');
select throws_ok($$ select encrypted_signing_secret from public.payment_accounts $$, '42501', null,
  'encrypted_signing_secret illisible même pour la propriétaire');
select throws_ok($$ select * from public.payment_accounts $$, '42501', null,
  'select * refusé (les colonnes doivent être listées)');
select throws_ok(format($$ update public.payment_accounts set encrypted_api_key = 'x' where id = %L $$, :'pa'),
  '42501', null, 'colonnes chiffrées non modifiables par le navigateur');
select throws_ok(format($$ update public.payment_accounts set status = 'connected' where id = %L $$, :'pa'),
  '42501', null, 'le statut « connecté » est posé par le serveur seulement');
select throws_ok(format($$ insert into public.payment_accounts (workspace_id, provider, encrypted_api_key) values (%L, 'whop', 'x') $$, :'wa'),
  '42501', null, 'impossible d''insérer un secret depuis le navigateur');
select lives_ok(format($$ insert into public.payment_accounts (workspace_id, provider, manual_instructions) values (%L, 'manual', 'MVola 034 00 000 00') $$, :'wa'),
  'coordonnées manuelles saisies par la propriétaire');

-- ---------------------------------------------------------------------------
-- payments : idempotence et passage à « payée ».
-- ---------------------------------------------------------------------------
select tests.as_service_role();
insert into public.payments (workspace_id, invoice_id, provider, method, amount, fee, currency, provider_reference)
values (:'wa', :'inv', 'papi', 'MVOLA', 200000, 2000, 'MGA', 'PAPI-123');
select is((select row(amount_paid, status::text) from public.invoices where id = :'inv'), row(200000::bigint, 'sent'::text),
  'paiement partiel : montant payé mis à jour, facture toujours envoyée');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, provider_reference) values (%L, %L, 'papi', 'MVOLA', 200000, 'MGA', 'PAPI-123') $$, :'wa', :'inv'),
  '23505', null, 'provider_reference unique : une notification rejouée ne paie pas deux fois');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'manual', 1, 'EUR') $$, :'wa', :'inv'),
  '55000', 'currency_mismatch', 'paiement dans une autre devise refusé');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'manual', 1, 'MGA') $$, :'wa', :'draft_inv'),
  '55000', 'invoice_not_payable', 'pas de paiement sur un brouillon');

select lives_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, provider_reference) values (%L, %L, 'whop', 'CARD', 1, 'MGA', 'PAPI-123') $$, :'wa', :'inv'),
  'provider_reference unique par fournisseur : même référence chez un autre fournisseur acceptée');
delete from public.payments where provider = 'whop';

-- ---------------------------------------------------------------------------
-- Le navigateur n'écrit que des paiements manuels : pas de faux paiement Papi,
-- pas de référence fournisseur réservée d'avance.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'papi', 'MVOLA', 250000, 'MGA') $$, :'wa', :'inv'),
  '42501', null, 'paiement Papi refusé depuis le navigateur');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'CARD', 250000, 'MGA') $$, :'wa', :'inv'),
  '42501', null, 'paiement manuel « carte » refusé (la carte passe par Whop)');
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, provider_reference) values (%L, %L, 'manual', 'manual', 1, 'MGA', 'PAPI-BOB-FUTURE-REF') $$, :'wa', :'inv'),
  '42501', null, 'provider_reference non réservable depuis le navigateur');
select id as papi_payment from public.payments where provider_reference = 'PAPI-123' \gset
select is(tests.affected(format($$ update public.payments set amount = 450000 where id = %L $$, :'papi_payment')), 0,
  'paiement Papi non modifiable par le navigateur');
select is(tests.affected(format($$ delete from public.payments where id = %L $$, :'papi_payment')), 0,
  'paiement Papi non supprimable par le navigateur');

-- « Marquer payée » : paiement manuel du reste dû, ici un MVola reçu en direct.
insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency)
values (:'wa', :'inv', 'manual', 'MVOLA', 250000, 'MGA') returning id as manual_payment \gset
select is((select method::text from public.payments where id = :'manual_payment'), 'MVOLA',
  'paiement manuel : moyen hors plateforme conservé dans l''historique');
select is((select row(amount_paid, status::text) from public.invoices where id = :'inv'), row(450000::bigint, 'paid'::text),
  'total couvert : la facture passe à payée');
select isnt((select paid_at from public.invoices where id = :'inv'), null, 'paid_at renseigné');
select throws_ok(format($$ update public.payments set provider = 'papi' where id = %L $$, :'manual_payment'),
  '42501', null, 'un paiement manuel ne devient pas un paiement Papi');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'inv'),
  '55000', 'invalid_status_transition', 'facture couverte : ne repasse pas à envoyée');
select throws_ok(format($$ update public.invoices set status = 'cancelled' where id = %L $$, :'inv'),
  '55000', 'invalid_status_transition', 'facture payée : finale');

delete from public.payments where id = :'manual_payment';
select is((select row(amount_paid, status::text, paid_at) from public.invoices where id = :'inv'),
  row(200000::bigint, 'sent'::text, null::timestamptz),
  'paiement supprimé : montant recalculé, la facture repasse à envoyée');
insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency)
values (:'wa', :'inv', 'manual', 'manual', 250000, 'MGA');
select is((select status::text from public.invoices where id = :'inv'), 'paid', 'nouveau paiement : de nouveau payée');

-- Paiement manuel : jamais au-delà du reste dû, jamais daté dans le futur.
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'manual', 999999, 'MGA') $$, :'wa', :'inv'),
  '55000', 'payment_exceeds_balance', 'facture déjà payée : paiement manuel refusé');
insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency)
values (:'wa', :'inv2', 'manual', 'MVOLA', 60000, 'MGA') returning id as p2 \gset
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'manual', 40001, 'MGA') $$, :'wa', :'inv2'),
  '55000', 'payment_exceeds_balance', 'paiement manuel supérieur au reste dû refusé');
select throws_ok(format($$ update public.payments set amount = 100001 where id = %L $$, :'p2'),
  '55000', 'payment_exceeds_balance', 'correction d''un paiement au-delà du total refusée');
select lives_ok(format($$ update public.payments set amount = 100000 where id = %L $$, :'p2'),
  'correction d''un paiement jusqu''au total acceptée (le paiement corrigé ne compte pas deux fois)');
select is((select row(amount_paid, status::text) from public.invoices where id = :'inv2'), row(100000::bigint, 'paid'::text),
  'paiement corrigé : facture payée');
update public.payments set amount = 60000 where id = :'p2';
select throws_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, paid_at) values (%L, %L, 'manual', 'manual', 1000, 'MGA', now() + interval '2 days') $$, :'wa', :'inv2'),
  '55000', 'payment_date_in_future', 'paiement manuel daté dans le futur refusé');
select is((select amount_paid from public.invoices where id = :'inv'), 450000::bigint,
  'les refus ne changent pas le montant encaissé');
-- Un paiement Papi réellement reçu est toujours enregistré, même en trop-perçu.
select tests.as_service_role();
select lives_ok(
  format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency, provider_reference) values (%L, %L, 'papi', 'MVOLA', 1000, 'MGA', 'PAPI-OVER') $$, :'wa', :'inv'),
  'paiement Papi en trop-perçu enregistré (argent réellement reçu)');
select tests.authenticate_as(:'alice');

-- ---------------------------------------------------------------------------
-- payment_links : lecture seule, notification_token invisible.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_url, notification_token)
values (:'wa', :'inv', :'pa', 'papi', 'IVN-1-1', 'https://app.papi.mg/pay/x', 'secret-notif') returning id as pl \gset
select throws_ok(
  format($$ insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference) values (%L, %L, %L, 'papi', 'IVN-1-1') $$, :'wa', :'inv', :'pa'),
  '23505', null, 'merchant_reference unique par fournisseur');
select tests.authenticate_as(:'alice');
select is((select provider_url from public.payment_links where id = :'pl'), 'https://app.papi.mg/pay/x',
  'la propriétaire voit son lien de paiement');
select throws_ok($$ select notification_token from public.payment_links $$, '42501', null,
  'notification_token illisible par le navigateur');
select throws_ok($$ select * from public.payment_links $$, '42501', null,
  'payment_links : select * refusé (lister les colonnes)');
select throws_ok(
  format($$ insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference) values (%L, %L, %L, 'papi', 'IVN-9-1') $$, :'wa', :'inv', :'pa'),
  '42501', null, 'payment_links : création réservée au serveur');
select throws_ok(format($$ update public.payment_links set notification_token = 'x' where id = %L $$, :'pl'),
  '42501', null, 'payment_links : notification_token non modifiable');

-- ---------------------------------------------------------------------------
-- webhook_events : service role uniquement.
-- ---------------------------------------------------------------------------
select throws_ok($$ select 1 from public.webhook_events $$, '42501', null, 'webhook_events illisible par authenticated');
select tests.as_service_role();
select lives_ok($$ insert into public.webhook_events (provider, raw_body, payload) values ('papi', '{"a":1}', '{"a":1}') $$,
  'le service role enregistre une notification');

-- ---------------------------------------------------------------------------
-- Storage : un membre n'accède qu'au dossier de son workspace.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wa' || '/logo.png'),
  'Alice dépose son logo dans son dossier');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('documents', %L) $$, :'wa' || '/invoices/F-0001.pdf'),
  'Alice dépose un PDF dans son dossier');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where bucket_id = 'documents' and name like %L $$, :'wa' || '/%')), 0,
  'Alice ne remplace pas un PDF déposé');
select set_config('storage.allow_delete_query', 'true', true);
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'documents' and name like %L $$, :'wa' || '/%')), 0,
  'Alice ne supprime pas un PDF déposé');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where bucket_id = 'logos' and name = %L $$, :'wa' || '/logo.png')), 1,
  'Alice remplace son logo');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wb' || '/logo.png'),
  '42501', null, 'Alice ne peut pas écrire dans le dossier de Bob');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('logos', 'pas-un-uuid/logo.png') $$,
  '42501', null, 'dossier qui n''est pas un workspace : refusé');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('logos', 'logo.png') $$,
  '42501', null, 'fichier à la racine : refusé');

select is((select count(*)::int from storage.objects where name like :'wa' || '/%'), 2,
  'Alice voit ses fichiers');
reset role;
select is((select array_agg(id || '=' || public order by id) from storage.buckets where id in ('logos', 'documents')),
  array['documents=false', 'logos=false'],
  'buckets privés (logo des documents émis lisible par anon via is_public_logo, cf. 04)');

select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 0,
  'anon ne lit aucun PDF');
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 0,
  'anon ne lit pas un logo absent de tout document émis');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wa' || '/pirate.png'),
  '42501', null, 'anon n''écrit pas dans le bucket des logos');

select tests.authenticate_as(:'bob');
select is((select count(*)::int from storage.objects where name like :'wa' || '/%'), 0,
  'Bob ne voit pas les fichiers d''Alice');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where name like %L $$, :'wa' || '/%')), 0,
  'Bob ne modifie pas les fichiers d''Alice');
select set_config('storage.allow_delete_query', 'true', true);
select is(tests.affected(format($$ delete from storage.objects where name like %L $$, :'wa' || '/%')), 0,
  'Bob ne supprime pas les fichiers d''Alice');

-- ---------------------------------------------------------------------------
-- Suppression d'un compte : le workspace dont il était le seul propriétaire part avec lui.
-- ---------------------------------------------------------------------------
reset role;
insert into public.contacts (workspace_id, name, phone) values (:'wb', 'Client Bob', '+261320000000');
select lives_ok(format($$ delete from auth.users where id = %L $$, :'bob'), 'suppression du compte de Bob');
select is((select count(*)::int from public.workspaces where id = :'wb'), 0, 'compte supprimé : son workspace aussi');
select is((select count(*)::int from public.contacts where workspace_id = :'wb'), 0, 'compte supprimé : aucune donnée orpheline');
select is((select count(*)::int from public.workspaces where id = :'wa'), 1, 'les autres workspaces ne sont pas touchés');

-- ---------------------------------------------------------------------------
-- Suppression d'un workspace (serveur) : tout part en cascade, documents émis compris.
-- ---------------------------------------------------------------------------
reset role;
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rabe', '+261330000000') returning id as cb2 \gset
select id as sa from public.pipeline_stages where workspace_id = :'wa' and kind = 'won' \gset
insert into public.deals (workspace_id, contact_id, stage_id, title) values (:'wa', :'cb2', :'sa', 'Site') returning id as deal \gset
insert into public.quotes (workspace_id, contact_id, deal_id) values (:'wa', :'cb2', :'deal') returning id as qd \gset
insert into public.document_lines (workspace_id, quote_id, description, unit_price) values (:'wa', :'qd', 'Site', 1000);
update public.quotes set status = 'sent' where id = :'qd';
update public.quotes set status = 'accepted' where id = :'qd';
select throws_ok(format($$ delete from public.deals where id = %L $$, :'deal'),
  '23503', null, 'une opportunité liée à un devis ne se supprime pas (elle s''archive)');
select lives_ok(format($$ delete from public.workspaces where id = %L $$, :'wa'),
  'suppression du workspace en cascade (devis accepté, facture payée, paiements)');
select is((select count(*)::int from public.invoices where workspace_id = :'wa'), 0, 'plus aucune facture du workspace');

select * from finish();
rollback;
