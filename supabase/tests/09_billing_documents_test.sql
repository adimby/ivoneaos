-- Devis et factures dans l'application (migration billing_documents) : enregistrement
-- atomique avec les lignes, « Transformer en facture », langue, accès anonyme.
begin;
\ir helpers.psql
select plan(60);
select (now() at time zone 'Indian/Antananarivo')::date as today \gset
select extract(year from now() at time zone 'Indian/Antananarivo')::int as y \gset

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
reset role;
-- Offre Lancement : plusieurs envois sans la limite Découverte (testée en 06).
update public.workspaces
set nif = '1234567890', stat = '12345112026000001', tax_regime = 'tva', plan = 'lancement'
where id = :'wa';
select tests.authenticate_as(:'alice');

insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000') returning id as ca \gset
select id as stage_quote from public.pipeline_stages where workspace_id = :'wa' and name = 'quote' \gset
select id as stage_won from public.pipeline_stages where workspace_id = :'wa' and kind = 'won' \gset
insert into public.deals (workspace_id, contact_id, stage_id, title) values (:'wa', :'ca', :'stage_quote', 'Logo')
returning id as deal \gset

-- ---------------------------------------------------------------------------
-- save_quote : création avec lignes, totaux, positions, langue.
-- ---------------------------------------------------------------------------
select public.save_quote(
  p_workspace_id => :'wa', p_contact_id => :'ca', p_deal_id => :'deal', p_currency => 'MGA',
  p_valid_until => :'today'::date + 30, p_discount => 50000, p_language => 'en',
  p_lines => '[{"description":" Logo ","quantity":1,"unit_price":400000},
               {"description":"Cartes","quantity":2.5,"unit_price":30001}]'::jsonb
) as q \gset

select is((select row(subtotal, discount, total) from public.quotes where id = :'q'),
  row(475003::bigint, 50000::bigint, 425003::bigint), 'devis : sous-total (2,5 × 30 001 arrondi), remise, total');
select is((select language::text from public.quotes where id = :'q'), 'en', 'devis : langue du document');
select is((select deal_id from public.quotes where id = :'q'), :'deal'::uuid, 'devis : opportunité liée');
select is((select array_agg(description order by position) from public.document_lines where quote_id = :'q'),
  array['Logo', 'Cartes'], 'devis : lignes dans l''ordre, description nettoyée');
select is((select array_agg(position order by position) from public.document_lines where quote_id = :'q'),
  array[0, 1], 'devis : positions 0, 1');

-- Modification d'un brouillon : en-tête et lignes ensemble.
select is(public.save_quote(
  p_workspace_id => :'wa', p_id => :'q', p_contact_id => :'ca', p_deal_id => :'deal', p_currency => 'MGA',
  p_valid_until => :'today'::date + 30, p_discount => 0, p_language => 'fr',
  p_lines => '[{"description":"Logo","quantity":1,"unit_price":450000}]'::jsonb), :'q'::uuid, 'brouillon modifié : même devis');
select is((select row(total, language::text) from public.quotes where id = :'q'), row(450000::bigint, 'fr'::text),
  'brouillon modifié : total et langue à jour');
select is((select count(*)::int from public.document_lines where quote_id = :'q'), 1, 'brouillon modifié : anciennes lignes retirées');

-- Erreurs : tout ou rien.
select throws_ok(format($$ select public.save_quote(p_workspace_id => %L, p_id => %L, p_contact_id => %L,
    p_currency => 'MGA', p_valid_until => %L, p_discount => 0, p_language => 'fr',
    p_lines => '[{"description":"A","quantity":1.005,"unit_price":1000}]') $$, :'wa', :'q', :'ca', :'today'::date + 30),
  '55000', 'quantity_too_precise', 'quantité à 3 décimales refusée');
select is((select row(total, discount) from public.quotes where id = :'q'), row(450000::bigint, 0::bigint),
  'échec : rien n''a changé (transaction annulée)');
select throws_ok(format($$ select public.save_quote(p_workspace_id => %L, p_contact_id => %L,
    p_currency => 'MGA', p_valid_until => %L, p_discount => 0, p_language => 'fr',
    p_lines => (select jsonb_agg(jsonb_build_object('description', 'L', 'quantity', 1, 'unit_price', 1)) from generate_series(1, 51))) $$,
    :'wa', :'ca', :'today'::date + 30),
  '55000', 'too_many_lines', '51 lignes refusées');

-- ---------------------------------------------------------------------------
-- Devis envoyé : modifiable, la version ne change que si le contenu change.
-- ---------------------------------------------------------------------------
update public.quotes set status = 'sent' where id = :'q';
select is((select number from public.quotes where id = :'q'), format('D-%s-0001', :y), 'devis envoyé : numéro D-AAAA-0001');
select public_token as tq from public.quotes where id = :'q' \gset
select public.get_public_quote(:'tq') ->> 'version' as v1 \gset
select array_agg(id order by id)::text as line_ids from public.document_lines where quote_id = :'q' \gset

select public.save_quote(p_workspace_id => :'wa', p_id => :'q', p_contact_id => :'ca', p_deal_id => :'deal',
  p_currency => 'MGA', p_valid_until => :'today'::date + 30, p_discount => 0, p_language => 'fr',
  p_lines => '[{"description":"Logo","quantity":"1.00","unit_price":450000}]');
select is((select array_agg(id order by id)::text from public.document_lines where quote_id = :'q'), :'line_ids',
  'mêmes lignes : rien n''est réécrit');
select is(public.get_public_quote(:'tq') ->> 'version', :'v1', 'mêmes lignes : la version vue par le client reste valable');

-- Toutes les lignes remplacées et remise augmentée : jamais vu vide ni à 0 en route.
select lives_ok(format($$ select public.save_quote(p_workspace_id => %L, p_id => %L, p_contact_id => %L, p_deal_id => %L,
    p_currency => 'MGA', p_valid_until => %L, p_discount => 100000, p_language => 'fr',
    p_lines => '[{"description":"Identité","quantity":1,"unit_price":600000}]') $$, :'wa', :'q', :'ca', :'deal', :'today'::date + 30),
  'devis envoyé : lignes remplacées et remise relevée sans document_empty');
select is((select total from public.quotes where id = :'q'), 500000::bigint, 'devis envoyé : nouveau total');
select isnt(public.get_public_quote(:'tq') ->> 'version', :'v1', 'contenu changé : nouvelle version');
select throws_ok(format($$ select public.save_quote(p_workspace_id => %L, p_id => %L, p_contact_id => %L,
    p_currency => 'MGA', p_valid_until => %L, p_discount => 0, p_language => 'fr', p_lines => '[]') $$,
    :'wa', :'q', :'ca', :'today'::date + 30),
  '55000', 'document_empty', 'devis envoyé : jamais vidé');

-- Seule la langue change : nouvelle version (PDF et messages dans l'autre langue).
select public.get_public_quote(:'tq') ->> 'version' as v2 \gset
select public.save_quote(p_workspace_id => :'wa', p_id => :'q', p_contact_id => :'ca', p_deal_id => :'deal',
  p_currency => 'MGA', p_valid_until => :'today'::date + 30, p_discount => 100000, p_language => 'en',
  p_lines => '[{"description":"Identité","quantity":1,"unit_price":600000}]');
select isnt(public.get_public_quote(:'tq') ->> 'version', :'v2', 'langue seule changée : nouvelle version');
select tests.as_anon();
select is(public.accept_quote(:'tq', :'v2'), 'outdated', 'langue changée : l''ancienne version n''est plus acceptable');
select tests.authenticate_as(:'alice');
select public.save_quote(p_workspace_id => :'wa', p_id => :'q', p_contact_id => :'ca', p_deal_id => :'deal',
  p_currency => 'MGA', p_valid_until => :'today'::date + 30, p_discount => 100000, p_language => 'fr',
  p_lines => '[{"description":"Identité","quantity":1,"unit_price":600000}]');
select is(public.get_public_quote(:'tq') ->> 'version', :'v2', 'langue rétablie : même version qu''avant');

-- E-mail du document : au plus un envoi toutes les 2 minutes.
select public.claim_document_email(:'q') as claim1 \gset
select isnt(:'claim1'::text, '', 'e-mail : premier envoi réservé');
select is(public.claim_document_email(:'q'), null, 'e-mail : renvoi immédiat refusé');
-- Envoi échoué : seule la réservation exacte est rendue (une autre heure ne lève rien).
select public.release_document_email(:'q', :'claim1'::timestamptz - interval '1 second');
select is(public.claim_document_email(:'q'), null, 'e-mail : autre heure, la limite reste');
select public.release_document_email(:'q', :'claim1');
select isnt(public.claim_document_email(:'q'), null, 'e-mail : réservation rendue, nouvel essai possible');
reset role;
update public.document_emails set sent_at = now() - interval '3 minutes' where document_id = :'q';
select tests.authenticate_as(:'alice');
select isnt(public.claim_document_email(:'q'), null, 'e-mail : renvoi possible après 2 minutes');
select is(public.claim_document_email(gen_random_uuid()), null, 'e-mail : document inconnu refusé');
select tests.new_quote(:'wa', :'ca') as qdraft \gset
select public_token as tdraft from public.quotes where id = :'qdraft' \gset
select is(public.claim_document_email(:'qdraft'), null, 'e-mail : brouillon refusé');
select throws_ok('select 1 from public.document_emails', '42501', null, 'e-mail : table interne, pas de lecture directe');

-- ---------------------------------------------------------------------------
-- Transformer en facture.
-- ---------------------------------------------------------------------------
select throws_ok(format($$ select public.create_invoice_from_quote(%L) $$, :'q'),
  '55000', 'quote_not_accepted', 'devis seulement envoyé : pas de facture');

update public.quotes set status = 'accepted' where id = :'q';
select is((select stage_id from public.deals where id = :'deal'), :'stage_won'::uuid, 'devis accepté : opportunité gagnée');
select throws_ok(format($$ select public.save_quote(p_workspace_id => %L, p_id => %L, p_contact_id => %L,
    p_currency => 'MGA', p_valid_until => %L, p_discount => 0, p_language => 'fr',
    p_lines => '[{"description":"Autre","quantity":1,"unit_price":1}]') $$, :'wa', :'q', :'ca', :'today'::date + 30),
  '55000', 'document_frozen', 'devis accepté : figé');

select public.create_invoice_from_quote(:'q') as inv \gset
select is((select row(status::text, number, quote_id, contact_id, currency::text, discount, total, language::text, due_on)
           from public.invoices where id = :'inv'),
  row('draft'::text, null::text, :'q'::uuid, :'ca'::uuid, 'MGA'::text, 100000::bigint, 500000::bigint, 'fr'::text, :'today'::date + 15),
  'facture brouillon : même client, devise, remise, total et langue ; échéance à 15 jours');
select is((select array_agg(row(position, description, quantity, unit_price)::text order by position) from public.document_lines where invoice_id = :'inv'),
  (select array_agg(row(position, description, quantity, unit_price)::text order by position) from public.document_lines where quote_id = :'q'),
  'facture : mêmes lignes que le devis');
select is(public.create_invoice_from_quote(:'q'), :'inv'::uuid, 'deuxième clic : la même facture');
select is((select count(*)::int from public.invoices where quote_id = :'q'), 1, 'une seule facture par devis');

update public.invoices set status = 'sent' where id = :'inv';
select is((select number from public.invoices where id = :'inv'), format('F-%s-0001', :y), 'facture envoyée : F-AAAA-0001');
select throws_ok(format($$ select public.save_invoice(p_workspace_id => %L, p_id => %L, p_contact_id => %L,
    p_currency => 'MGA', p_exchange_rate => 1, p_due_on => %L, p_discount => 0, p_language => 'fr',
    p_lines => '[{"description":"Autre","quantity":1,"unit_price":1}]') $$, :'wa', :'inv', :'ca', :'today'::date + 15),
  '55000', 'document_frozen', 'facture envoyée : figée');

-- ---------------------------------------------------------------------------
-- save_invoice : facture en euros avec taux vers l'ariary.
-- ---------------------------------------------------------------------------
select public.save_invoice(p_workspace_id => :'wa', p_contact_id => :'ca', p_currency => 'EUR', p_exchange_rate => 1,
  p_due_on => :'today'::date + 10, p_discount => 0, p_language => 'en',
  p_lines => '[{"description":"Design","quantity":3,"unit_price":12050}]') as ie \gset
select is((select total from public.invoices where id = :'ie'), 36150::bigint, 'facture EUR : total en centimes');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'ie'),
  '55000', 'exchange_rate_required', 'facture EUR sans taux : non envoyée');
select public.save_invoice(p_workspace_id => :'wa', p_id => :'ie', p_contact_id => :'ca', p_currency => 'EUR', p_exchange_rate => 5012.5,
  p_due_on => :'today'::date + 10, p_discount => 0, p_language => 'en',
  p_lines => '[{"description":"Design","quantity":3,"unit_price":12050}]');
update public.invoices set status = 'sent' where id = :'ie';
select is((select row(number, exchange_rate) from public.invoices where id = :'ie'),
  row(format('F-%s-0002', :y), 5012.5::numeric(18, 6)), 'facture EUR avec taux : envoyée, numérotée sans trou');

-- Marquer payée : paiement manuel du reste dû.
insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency)
values (:'wa', :'ie', 'manual', 'manual', 36150, 'EUR');
select is((select status::text from public.invoices where id = :'ie'), 'paid', 'paiement manuel du total : payée');

-- ---------------------------------------------------------------------------
-- Autre workspace : rien n'est visible ni modifiable.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bob');
select is(public.create_invoice_from_quote(:'q'), null, 'Bob : devis d''Alice introuvable');
select is(public.save_quote(p_workspace_id => :'wb', p_id => :'q', p_contact_id => :'ca', p_currency => 'MGA',
  p_valid_until => :'today'::date + 30, p_discount => 0, p_language => 'fr',
  p_lines => '[{"description":"X","quantity":1,"unit_price":1}]'), null, 'Bob : devis d''Alice non modifiable');
select throws_ok(format($$ select public.save_quote(p_workspace_id => %L, p_contact_id => %L, p_currency => 'MGA',
    p_valid_until => %L, p_discount => 0, p_language => 'fr',
    p_lines => '[{"description":"X","quantity":1,"unit_price":1}]') $$, :'wa', :'ca', :'today'::date + 30),
  '42501', null, 'Bob : pas de devis dans le workspace d''Alice');
select is((select count(*)::int from public.document_lines), 0, 'Bob : aucune ligne visible');
select is(public.claim_document_email(:'q'), null, 'Bob : pas d''e-mail pour le devis d''Alice');
reset role;
select sent_at as alice_claim from public.document_emails where document_id = :'q' \gset
select tests.authenticate_as(:'bob');
select public.release_document_email(:'q', :'alice_claim');
reset role;
select is((select count(*)::int from public.document_emails where document_id = :'q'), 1,
  'Bob : ne rend pas la réservation d''Alice');
select tests.authenticate_as(:'bob');

-- ---------------------------------------------------------------------------
-- Anonyme : seulement les fonctions publiques.
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok('select 1 from public.quotes', '42501', null, 'anon : pas de lecture des devis');
select throws_ok('select 1 from public.invoices', '42501', null, 'anon : pas de lecture des factures');
select throws_ok('select 1 from public.document_lines', '42501', null, 'anon : pas de lecture des lignes');
select throws_ok(format($$ select public.create_invoice_from_quote(%L) $$, :'q'), '42501', null,
  'anon : pas de transformation en facture');
select throws_ok(format($$ select public.save_invoice(p_workspace_id => %L, p_contact_id => %L, p_currency => 'MGA',
    p_exchange_rate => 1, p_due_on => null, p_discount => 0, p_language => 'fr', p_lines => '[]') $$, :'wa', :'ca'),
  '42501', null, 'anon : pas d''enregistrement de facture');
select throws_ok(format($$ select public.claim_document_email(%L) $$, :'q'), '42501', null,
  'anon : pas d''envoi d''e-mail');
select throws_ok(format($$ select public.release_document_email(%L, now()) $$, :'q'), '42501', null,
  'anon : pas de réservation rendue');
select throws_ok('select 1 from public.document_emails', '42501', null, 'anon : pas de lecture des envois d''e-mails');
select is(public.get_public_quote(:'tq') ->> 'language', 'fr', 'page publique : langue du devis');
select ok(public.public_document_exists(:'tq'), 'anon : un devis émis existe (page publique 200)');
select ok(not public.public_document_exists(repeat('x', 32)), 'anon : jeton inconnu (page publique 404)');
select ok(not public.public_document_exists(:'tdraft'), 'anon : brouillon introuvable (page publique 404)');

select * from finish();
rollback;
