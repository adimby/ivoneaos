-- Paiement Papi : record_papi_payment (service role seulement, idempotent, montant égal
-- au lien), secrets jamais lisibles par le navigateur, papi_available de la page publique.
begin;
\ir helpers.psql
select plan(41);

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
select tests.new_invoice(:'wa', :'ca', 450000) as inv \gset
update public.invoices set status = 'sent' where id = :'inv';
select public_token as inv_token from public.invoices where id = :'inv' \gset

-- ---------------------------------------------------------------------------
-- Droits : fonction réservée au service role.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.record_papi_payment(text, text, bigint, bigint, public.payment_method, timestamptz)', 'execute'),
  'service role : record_papi_payment exécutable');
select ok(not has_function_privilege('authenticated', 'public.record_papi_payment(text, text, bigint, bigint, public.payment_method, timestamptz)', 'execute'),
  'authenticated : record_papi_payment refusée');
select ok(not has_function_privilege('anon', 'public.record_papi_payment(text, text, bigint, bigint, public.payment_method, timestamptz)', 'execute'),
  'anon : record_papi_payment refusée');

-- ---------------------------------------------------------------------------
-- Compte et lien créés par le serveur.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
insert into public.payment_accounts (workspace_id, provider, status, encrypted_api_key, encrypted_signing_secret, last_checked_at)
values (:'wa', 'papi', 'connected', 'v1:iv:tag:key', 'v1:iv:tag:secret', now()) returning id as pa \gset
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_url,
                                  notification_token, amount, expires_at)
values (:'wa', :'inv', :'pa', 'papi', 'IVN-' || :'inv' || '-1', 'https://payment-form.papi.mg/s/payments/jwt', 'tok-secret',
        450000, now() + interval '7 days')
returning id as link \gset

-- ---------------------------------------------------------------------------
-- Secrets : jamais lisibles par le navigateur, même pour la propriétaire.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select throws_ok($$ select encrypted_api_key from public.payment_accounts $$, '42501', null,
  'authenticated : clé API chiffrée illisible');
select throws_ok($$ select encrypted_signing_secret from public.payment_accounts $$, '42501', null,
  'authenticated : secret de signature chiffré illisible');
select throws_ok($$ select notification_token from public.payment_links $$, '42501', null,
  'authenticated : notification_token illisible');
select is((select amount from public.payment_links where id = :'link'), 450000::bigint,
  'authenticated : montant du lien lisible par la propriétaire');
select throws_ok(format($$ select public.record_papi_payment('IVN-%s-1', 'X', 450000, 0, 'MVOLA') $$, :'inv'),
  '42501', null, 'authenticated : impossible de se déclarer payée');
select throws_ok(format($$ update public.payment_links set status = 'paid' where id = %L $$, :'link'),
  '42501', null, 'authenticated : statut du lien non modifiable');

select tests.as_anon();
select throws_ok($$ select encrypted_api_key from public.payment_accounts $$, '42501', null,
  'anon : aucune lecture des comptes de paiement');
select throws_ok($$ select id from public.webhook_events $$, '42501', null,
  'anon : aucune lecture des notifications reçues');
select throws_ok(format($$ select public.record_papi_payment('IVN-%s-1', 'X', 450000, 0, 'MVOLA') $$, :'inv'),
  '42501', null, 'anon : record_papi_payment refusée');
select is((public.get_public_invoice(:'inv_token') -> 'payment' ->> 'papi_available')::boolean, true,
  'page publique : paiement Papi proposé (ariary, compte connecté, au moins 300 Ar)');
select is(public.get_public_invoice(:'inv_token') -> 'payment' ->> 'payment_link_url', 'https://payment-form.papi.mg/s/payments/jwt',
  'page publique : lien actif exposé');
select ok(public.get_public_invoice(:'inv_token')::text !~ 'tok-secret|v1:iv',
  'page publique : ni jeton de notification ni secret');

select tests.authenticate_as(:'alice');
select throws_ok($$ select id from public.webhook_events $$, '42501', null,
  'authenticated : aucune lecture des notifications reçues');

-- ---------------------------------------------------------------------------
-- Enregistrement : montant égal au lien, idempotent sur la référence Papi.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
select is(public.record_papi_payment('IVN-inconnue-1', 'P-0', 450000, 0, 'MVOLA'), 'unknown_link',
  'référence inconnue : rien d''enregistré');
select is(public.record_papi_payment('IVN-' || :'inv' || '-1', 'P-1', 300000, 0, 'MVOLA'), 'amount_mismatch',
  'montant différent du lien : refusé');
select is((select count(*)::int from public.payments where invoice_id = :'inv'), 0, 'aucun paiement après un refus');
select is(public.record_papi_payment('IVN-' || :'inv' || '-1', 'P-1', 450000, 4500, 'MVOLA'), 'recorded',
  'paiement vérifié enregistré');
select is((select row(status::text, amount_paid) from public.invoices where id = :'inv'), row('paid'::text, 450000::bigint),
  'la facture passe à payée');
select is((select row(status::text) from public.payment_links where id = :'link'), row('paid'::text), 'le lien passe à payé');
select is(public.record_papi_payment('IVN-' || :'inv' || '-1', 'P-1', 450000, 4500, 'MVOLA'), 'duplicate',
  'notification rejouée : doublon, rien de plus');
select is((select row(count(*)::int, sum(amount)::bigint, max(fee)) from public.payments where invoice_id = :'inv'),
  row(1, 450000::bigint, 4500::bigint), 'un seul paiement, frais conservés');

-- ---------------------------------------------------------------------------
-- Copies de la clé et du secret sur le lien : illisibles par la propriétaire.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
update public.payment_links set encrypted_signing_secret = 'v1:iv:tag:linksecret', encrypted_api_key = 'v1:iv:tag:linkkey'
where id = :'link';
select tests.authenticate_as(:'alice');
select throws_ok($$ select encrypted_signing_secret from public.payment_links $$, '42501', null,
  'authenticated : copie chiffrée du secret sur le lien illisible');
select throws_ok($$ select encrypted_api_key from public.payment_links $$, '42501', null,
  'authenticated : copie chiffrée de la clé API sur le lien illisible');
select ok(not has_function_privilege('authenticated', 'public.invoices_cancel_links()', 'execute'),
  'authenticated : fonction du trigger d''annulation non exécutable');

-- ---------------------------------------------------------------------------
-- Rattrapé par relecture (frais inconnus) puis notifié : frais complétés, pas de doublon.
-- ---------------------------------------------------------------------------
reset role;
select tests.new_invoice(:'wa', :'ca', 200000) as inv2 \gset
update public.invoices set status = 'sent' where id = :'inv2';
select tests.as_service_role();
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, amount, expires_at)
values (:'wa', :'inv2', :'pa', 'papi', 'IVN-' || :'inv2' || '-1', 200000, now() + interval '7 days');
select is(public.record_papi_payment('IVN-' || :'inv2' || '-1', 'P-2', 200000, 0, 'ORANGE_MONEY'), 'recorded',
  'paiement rattrapé par relecture (frais à 0)');
select is(public.record_papi_payment('IVN-' || :'inv2' || '-1', 'P-2', 200000, 2000, 'ORANGE_MONEY'), 'duplicate',
  'notification arrivée ensuite : doublon');
select is((select row(count(*)::int, max(fee)) from public.payments where invoice_id = :'inv2'), row(1, 2000::bigint),
  'frais réels complétés par la notification');

-- ---------------------------------------------------------------------------
-- Montant différent : lien en échec, anomalie lisible par la propriétaire, plus relu.
-- ---------------------------------------------------------------------------
reset role;
select tests.new_invoice(:'wa', :'ca', 100000) as inv3 \gset
update public.invoices set status = 'sent' where id = :'inv3';
select tests.as_service_role();
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, amount, expires_at)
values (:'wa', :'inv3', :'pa', 'papi', 'IVN-' || :'inv3' || '-1', 100000, now() + interval '7 days') returning id as link3 \gset
select is(public.record_papi_payment('IVN-' || :'inv3' || '-1', 'P-3', 90000, 0, 'MVOLA'), 'amount_mismatch',
  'montant différent : refusé');
select tests.authenticate_as(:'alice');
select is((select row(status::text, last_error) from public.payment_links where id = :'link3'), row('failed'::text, 'amount_mismatch'::text),
  'lien en échec, anomalie visible par la freelance');

-- ---------------------------------------------------------------------------
-- Facture annulée : ses liens ouverts sont annulés ; un paiement reçu quand même chez Papi
-- est enregistré (l'argent est reçu) et visible sur la facture annulée.
-- ---------------------------------------------------------------------------
reset role;
select tests.new_invoice(:'wa', :'ca', 50000) as inv4 \gset
update public.invoices set status = 'sent' where id = :'inv4';
select tests.as_service_role();
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, amount, expires_at)
values (:'wa', :'inv4', :'pa', 'papi', 'IVN-' || :'inv4' || '-1', 50000, now() + interval '7 days') returning id as link4 \gset
select tests.authenticate_as(:'alice');
update public.invoices set status = 'cancelled' where id = :'inv4';
select is((select status::text from public.payment_links where id = :'link4'), 'cancelled',
  'facture annulée : lien Papi annulé');
select tests.as_service_role();
select is(public.record_papi_payment('IVN-' || :'inv4' || '-1', 'P-4', 50000, 500, 'MVOLA'), 'recorded',
  'paiement Papi sur une facture annulée : enregistré');
select is((select row(status::text, amount_paid) from public.invoices where id = :'inv4'), row('cancelled'::text, 50000::bigint),
  'facture toujours annulée, montant reçu visible');
select is((select status::text from public.payment_links where id = :'link4'), 'paid', 'lien annulé puis payé : payé');

-- ---------------------------------------------------------------------------
-- Lien remplacé (annulé ici) mais payé chez Papi : enregistré, trop-perçu visible.
-- ---------------------------------------------------------------------------
reset role;
select tests.new_invoice(:'wa', :'ca', 1000) as inv5 \gset
update public.invoices set status = 'sent' where id = :'inv5';
select tests.as_service_role();
insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency)
values (:'wa', :'inv5', 'manual', 'MVOLA', 400, 'MGA');
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, amount, status, expires_at)
values (:'wa', :'inv5', :'pa', 'papi', 'IVN-' || :'inv5' || '-1', 1000, 'cancelled', now() + interval '7 days');
select is(public.record_papi_payment('IVN-' || :'inv5' || '-1', 'P-5', 1000, 0, 'MVOLA'), 'recorded',
  'ancien lien payé quand même : enregistré');
select is((select row(status::text, amount_paid, total) from public.invoices where id = :'inv5'), row('paid'::text, 1400::bigint, 1000::bigint),
  'trop-perçu visible (montant reçu supérieur au total)');

-- ---------------------------------------------------------------------------
-- Clé refusée par Papi depuis (statut « error ») : paiement Papi plus proposé.
-- ---------------------------------------------------------------------------
reset role;
select tests.new_invoice(:'wa', :'ca', 80000) as inv6 \gset
update public.invoices set status = 'sent' where id = :'inv6';
select public_token as inv6_token from public.invoices where id = :'inv6' \gset
select is((public.get_public_invoice(:'inv6_token') -> 'payment' ->> 'papi_available')::boolean, true, 'compte connecté : Papi proposé');
select tests.as_service_role();
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_url, amount, expires_at)
values (:'wa', :'inv6', :'pa', 'papi', 'IVN-' || :'inv6' || '-1', 'https://payment-form.papi.mg/s/inv6', 80000, now() + interval '7 days');
reset role;
update public.payment_accounts set status = 'error' where id = :'pa';
select is((select count(*)::int from pg_trigger where tgrelid = 'public.invoices'::regclass and tgname like '%cancel%links'), 1,
  'un seul trigger annule les liens d''une facture annulée (t50_cancel_links)');
select is((public.get_public_invoice(:'inv6_token') -> 'payment' ->> 'papi_available')::boolean, false,
  'compte à reconnecter avec un lien encore actif : Papi toujours pas proposé (seul papi_available compte)');

select * from finish();
rollback;
