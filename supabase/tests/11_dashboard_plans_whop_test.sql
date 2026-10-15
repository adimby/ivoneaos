-- Étape 7 : fonctions du tableau de bord et de l'offre (droits de l'appelant), vues de la
-- garantie (service role seulement), record_whop_payment (service role seulement) et
-- whop_available de la page publique.
begin;
\ir helpers.psql
select plan(52);

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
insert into public.contacts (workspace_id, name, email) values (:'wa', 'Rabe', 'rabe@example.test');
-- Facture ariary envoyée, payée en partie ce mois-ci ; facture EUR envoyée (taux 5000), en retard.
select tests.new_invoice(:'wa', :'ca', 450000) as inv_mga \gset
update public.invoices set status = 'sent' where id = :'inv_mga';
insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency)
values (:'wa', :'inv_mga', 'manual', 'MVOLA', 150000, 'MGA');
select tests.new_invoice(:'wa', :'ca', 12050) as inv_eur \gset
update public.invoices set currency = 'EUR', exchange_rate = 5000 where id = :'inv_eur';
update public.invoices set status = 'sent' where id = :'inv_eur';
-- Échéance passée : facture vieillie (gardes désactivées le temps de l'écriture).
alter table public.invoices disable trigger t10_guard;
update public.invoices set issued_on = (now() at time zone 'Indian/Antananarivo')::date - 40,
  due_on = (now() at time zone 'Indian/Antananarivo')::date - 3 where id = :'inv_eur';
alter table public.invoices enable trigger t10_guard;
select public_token as eur_token from public.invoices where id = :'inv_eur' \gset
insert into public.activities (workspace_id, contact_id, kind) values (:'wa', :'ca', 'call'), (:'wa', :'ca', 'whatsapp');

-- ---------------------------------------------------------------------------
-- Tableau de bord et usage : RLS de l'appelant.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.dashboard_invoice_totals(uuid)', 'execute'),
  'anon : dashboard_invoice_totals refusée');
select ok(not has_function_privilege('anon', 'public.plan_usage(uuid)', 'execute'), 'anon : plan_usage refusée');
select ok(has_function_privilege('authenticated', 'public.dashboard_invoice_totals(uuid)', 'execute'),
  'authenticated : dashboard_invoice_totals exécutable');
select ok(not (select prosecdef from pg_proc where oid = 'public.dashboard_invoice_totals(uuid)'::regprocedure),
  'dashboard_invoice_totals : droits de l''appelant (security invoker)');
select ok(not (select prosecdef from pg_proc where oid = 'public.plan_usage(uuid)'::regprocedure),
  'plan_usage : droits de l''appelant (security invoker)');

select tests.authenticate_as(:'alice');
select is((select row(item_count, amount) from public.dashboard_invoice_totals(:'wa') where kind = 'collected'),
  row(1, 150000::bigint), 'encaissé ce mois-ci : le paiement MVola');
select is((select row(item_count, amount, overdue) from public.dashboard_invoice_totals(:'wa') where kind = 'pending' and currency = 'MGA'),
  row(1, 300000::bigint, false), 'en attente : reste dû de la facture ariary');
select is((select row(exchange_rate, amount, overdue) from public.dashboard_invoice_totals(:'wa') where kind = 'pending' and currency = 'EUR'),
  row(5000::numeric, 12050::bigint, true), 'facture EUR : devise et taux renvoyés tels quels, en retard');
select is((select row(active_contacts, documents_this_month) from public.plan_usage(:'wa')), row(2, 2),
  'usage : 2 contacts actifs, 2 factures envoyées ce mois-ci');

select tests.authenticate_as(:'bob');
select is((select count(*)::int from public.dashboard_invoice_totals(:'wa')), 0,
  'autre workspace : aucun total visible');
select is((select row(active_contacts, documents_this_month) from public.plan_usage(:'wa')), row(0, 0),
  'autre workspace : usage à zéro');

select tests.as_anon();
select throws_ok(format($$ select * from public.dashboard_invoice_totals(%L) $$, :'wa'), '42501', null,
  'anon : tableau de bord refusé');

-- ---------------------------------------------------------------------------
-- Garantie : vues illisibles par le navigateur.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select throws_ok($$ select * from public.guarantee_workspaces $$, '42501', null,
  'authenticated : guarantee_workspaces illisible');
select throws_ok($$ select * from public.guarantee_weekly $$, '42501', null,
  'authenticated : guarantee_weekly illisible');
select tests.as_anon();
select throws_ok($$ select * from public.guarantee_workspaces $$, '42501', null, 'anon : guarantee_workspaces illisible');
select throws_ok($$ select * from public.guarantee_weekly $$, '42501', null, 'anon : guarantee_weekly illisible');
select tests.as_service_role();
select is((select row(owner_id, invoices_sent, quotes_sent) from public.guarantee_workspaces where workspace_id = :'wa'),
  row(:'alice'::uuid, 2, 0), 'service role : indicateurs du workspace');
select is((select row(prospects_contacted, touchpoints, invoices_sent) from public.guarantee_weekly
           where workspace_id = :'wa' and week_start = date_trunc('week', now() at time zone 'Indian/Antananarivo')::date),
  row(1, 2, 2), 'service role : semaine en cours (1 prospect, 2 échanges, 2 factures)');

-- ---------------------------------------------------------------------------
-- Whop : record_whop_payment réservé au service role.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('service_role',
  'public.record_whop_payment(text, text, text, text, bigint, public.currency, bigint, timestamptz)', 'execute'),
  'service role : record_whop_payment exécutable');
select ok(not has_function_privilege('authenticated',
  'public.record_whop_payment(text, text, text, text, bigint, public.currency, bigint, timestamptz)', 'execute'),
  'authenticated : record_whop_payment refusée');
select ok(not has_function_privilege('anon',
  'public.record_whop_payment(text, text, text, text, bigint, public.currency, bigint, timestamptz)', 'execute'),
  'anon : record_whop_payment refusée');

select tests.as_anon();
select is((public.get_public_invoice(:'eur_token') -> 'payment' ->> 'whop_available')::boolean, false,
  'page publique : pas de carte sans compte Whop connecté');

select tests.as_service_role();
insert into public.payment_accounts (workspace_id, provider, status, external_account_id)
values (:'wa', 'whop', 'connected', 'biz_alice') returning id as wpa \gset
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_link_id,
                                  provider_url, amount)
values (:'wa', :'inv_eur', :'wpa', 'whop', 'IVW-' || :'inv_eur' || '-1', 'ch_1', 'https://whop.com/checkout/ch_1/', 12050)
returning id as wlink \gset

select tests.as_anon();
select is((public.get_public_invoice(:'eur_token') -> 'payment' ->> 'whop_available')::boolean, true,
  'page publique : carte proposée (EUR, compte Whop connecté, reste dû)');
select is((public.get_public_invoice(:'eur_token') -> 'payment' ->> 'papi_available')::boolean, false,
  'page publique : pas de Papi sur une facture EUR');

select tests.authenticate_as(:'alice');
select throws_ok(format($$ select public.record_whop_payment('IVW-%s-1', 'ch_1', 'biz_alice', 'pay_1', 12050, 'EUR', 0) $$, :'inv_eur'),
  '42501', null, 'authenticated : impossible de se déclarer payée');

select tests.as_service_role();
select is(public.record_whop_payment('IVW-inconnue-1', null, 'biz_alice', 'pay_0', 12050, 'EUR', 0), 'unknown_link',
  'référence inconnue : rien d''enregistré');
select is(public.record_whop_payment('IVW-' || :'inv_eur' || '-1', 'ch_autre', 'biz_alice', 'pay_0', 12050, 'EUR', 0), 'unknown_link',
  'configuration de paiement différente du lien : refusé');
select is(public.record_whop_payment('IVW-' || :'inv_eur' || '-1', 'ch_1', 'biz_autre', 'pay_0', 12050, 'EUR', 0), 'account_mismatch',
  'paiement reçu sur un autre compte Whop : refusé');
select is(public.record_whop_payment('IVW-' || :'inv_eur' || '-1', 'ch_1', null, 'pay_0', 12050, 'EUR', 0), 'account_mismatch',
  'paiement sans compte Whop lisible : refusé (métadonnées recopiées sur un autre compte)');
select is(public.record_whop_payment('IVW-' || :'inv_eur' || '-1', null, 'biz_alice', 'pay_0', 12050, 'EUR', 0), 'unknown_link',
  'paiement sans configuration (ch_…) alors que le lien en a une : refusé');
select is((select count(*)::int from public.payments where invoice_id = :'inv_eur'), 0, 'aucun paiement après un refus');
select is(public.record_whop_payment(null, 'ch_1', 'biz_alice', 'pay_1', 12050, 'EUR', 530), 'recorded',
  'paiement retrouvé par la configuration (ch_…) : enregistré');
select is((select row(status::text, amount_paid) from public.invoices where id = :'inv_eur'), row('paid'::text, 12050::bigint),
  'la facture EUR passe à payée');
select is((select row(provider::text, method::text, fee, currency::text) from public.payments where invoice_id = :'inv_eur'),
  row('whop'::text, 'CARD'::text, 530::bigint, 'EUR'::text), 'paiement par carte Whop, frais conservés');
select is((select status::text from public.payment_links where id = :'wlink'), 'paid', 'le lien passe à payé');
select is(public.record_whop_payment('IVW-' || :'inv_eur' || '-1', 'ch_1', 'biz_alice', 'pay_1', 12050, 'EUR', 530), 'duplicate',
  'webhook rejoué : doublon, rien de plus');

-- Montant différent : lien en échec, anomalie notée.
reset role;
select tests.new_invoice(:'wa', :'ca', 9900) as inv_usd \gset
update public.invoices set currency = 'USD', exchange_rate = 4500 where id = :'inv_usd';
update public.invoices set status = 'sent' where id = :'inv_usd';
select tests.as_service_role();
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_link_id, amount)
values (:'wa', :'inv_usd', :'wpa', 'whop', 'IVW-' || :'inv_usd' || '-1', 'ch_2', 9900) returning id as wlink2 \gset
select is(public.record_whop_payment('IVW-' || :'inv_usd' || '-1', 'ch_2', 'biz_alice', 'pay_2', 9900, 'EUR', 0), 'amount_mismatch',
  'devise différente de la facture : refusé');
select is((select row(status::text, last_error) from public.payment_links where id = :'wlink2'), row('failed'::text, 'amount_mismatch'::text),
  'lien en échec, anomalie notée');

-- Lien annulé ici (facture réglée autrement) mais payé chez Whop : argent réellement reçu,
-- enregistré ; trop-perçu visible sur la facture.
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_link_id,
                                  status, amount)
values (:'wa', :'inv_eur', :'wpa', 'whop', 'IVW-' || :'inv_eur' || '-2', 'ch_3', 'cancelled', 12050) returning id as wlink3 \gset
select is(public.record_whop_payment('IVW-' || :'inv_eur' || '-2', 'ch_3', 'biz_alice', 'pay_3', 12050, 'EUR', 0), 'recorded',
  'lien annulé mais payé chez Whop : enregistré (argent reçu)');
select is((select row(status::text, amount_paid - total) from public.invoices where id = :'inv_eur'), row('paid'::text, 12050::bigint),
  'trop-perçu visible (montant reçu supérieur au total)');
select is((select status::text from public.payment_links where id = :'wlink3'), 'paid', 'le lien annulé passe à payé');

-- Paiement authentique non enregistrable hors record_whop_payment : anomalie notée sur le lien.
select ok(has_function_privilege('service_role', 'public.flag_whop_link(text, text, text)', 'execute'),
  'service role : flag_whop_link exécutable');
select ok(not has_function_privilege('authenticated', 'public.flag_whop_link(text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.flag_whop_link(text, text, text)', 'execute'),
  'navigateur : flag_whop_link refusée');
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_link_id, amount)
values (:'wa', :'inv_usd', :'wpa', 'whop', 'IVW-' || :'inv_usd' || '-2', 'ch_4', 9900) returning id as wlink4 \gset
select is(public.flag_whop_link(null, 'ch_4', 'currency_mismatch'), true, 'lien retrouvé par la configuration (ch_…)');
select is((select row(status::text, last_error) from public.payment_links where id = :'wlink4'),
  row('failed'::text, 'currency_mismatch'::text), 'débit dans une autre devise : lien en échec, anomalie notée');
select is(public.flag_whop_link('IVW-' || :'inv_eur' || '-2', null, 'account_mismatch'), true, 'lien retrouvé par la référence');
select is((select row(status::text, last_error) from public.payment_links where id = :'wlink3'),
  row('paid'::text, 'account_mismatch'::text), 'autre compte : anomalie notée, statut du lien inchangé');
select is(public.flag_whop_link('IVW-inconnue-9', 'ch_inconnue', 'unknown_link'), false, 'aucun lien retrouvé : false');

-- Tableau de bord : taux des factures exprimés vers la devise par défaut, qui ne change
-- plus dès qu'une facture est émise.
reset role;
select throws_ok(format($$ update public.workspaces set default_currency = 'USD' where id = %L $$, :'wa'),
  '55000', 'default_currency_locked', 'devise par défaut figée : les taux des factures restent valables');

-- Devise par défaut changée avant toute émission : le taux d'un brouillon en autre devise
-- (exprimé vers l'ancienne devise) est remis à 1 et doit être ressaisi avant l'émission.
update public.workspaces set nif = '2234567890', stat = '22345 11 2026 0 00001', tax_regime = 'tva' where id = :'wb';
insert into public.contacts (workspace_id, name, phone) values (:'wb', 'Rasoa', '+261340000001') returning id as cb \gset
select tests.new_invoice(:'wb', :'cb', 9900) as bob_usd \gset
update public.invoices set currency = 'USD', exchange_rate = 4500 where id = :'bob_usd';
update public.workspaces set default_currency = 'EUR' where id = :'wb';
select is((select exchange_rate from public.invoices where id = :'bob_usd'), 1::numeric,
  'brouillon USD : taux vers l''ancienne devise remis à 1');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'bob_usd'),
  '55000', 'exchange_rate_required', 'émission refusée tant que le nouveau taux n''est pas saisi');
update public.invoices set exchange_rate = 1.1 where id = :'bob_usd';
update public.invoices set status = 'sent' where id = :'bob_usd';
select is((select row(status::text, exchange_rate) from public.invoices where id = :'bob_usd'), row('sent'::text, 1.1::numeric),
  'nouveau taux saisi : facture émise');

select * from finish();
rollback;
