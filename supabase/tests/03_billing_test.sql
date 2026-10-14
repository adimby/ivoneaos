-- Devis et factures : totaux, cycle de vie, numérotation sans trou, documents figés,
-- jetons publics. Limites de l'offre Découverte : 06_plan_limits_test.sql.
begin;
\ir helpers.psql
select plan(108);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
-- Offre Lancement (illimitée) : ce fichier émet bien plus de 3 documents.
reset role;
update public.workspaces set plan = 'lancement' where id = :'wa';
select tests.authenticate_as(:'alice');
select extract(year from now() at time zone 'Indian/Antananarivo')::int as y \gset
select (now() at time zone 'Indian/Antananarivo')::date as today \gset

insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000')
returning id as ca \gset
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rabe', '+261330000000')
returning id as ca2 \gset

-- ---------------------------------------------------------------------------
-- Colonnes posées par la base : le navigateur ne les écrit pas.
-- ---------------------------------------------------------------------------
select throws_ok(format($$ insert into public.quotes (workspace_id, contact_id, number) values (%L, %L, 'D-9999-0001') $$, :'wa', :'ca'),
  '42501', null, 'le numéro ne se saisit pas');
select throws_ok(format($$ insert into public.quotes (workspace_id, contact_id, total) values (%L, %L, 999) $$, :'wa', :'ca'),
  '42501', null, 'le total ne se saisit pas');
select throws_ok(format($$ insert into public.quotes (workspace_id, contact_id, public_token) values (%L, %L, 'a') $$, :'wa', :'ca'),
  '42501', null, 'le jeton public ne se saisit pas');
select throws_ok(format($$ insert into public.quotes (workspace_id, contact_id, status) values (%L, %L, 'sent') $$, :'wa', :'ca'),
  '42501', null, 'un devis ne naît pas émis');
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id, amount_paid) values (%L, %L, 5000) $$, :'wa', :'ca'),
  '42501', null, 'amount_paid ne se saisit pas');
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id, issued_on) values (%L, %L, '2020-01-01') $$, :'wa', :'ca'),
  '42501', null, 'la date d''émission ne se saisit pas');

-- Même via le serveur (clé secrète), les gardes imposent les valeurs.
select tests.as_service_role();
insert into public.quotes (workspace_id, contact_id, number, total, public_token)
values (:'wa', :'ca', 'D-9999-0001', 999, 'a') returning id as qsrv \gset
select is((select row(number, total) from public.quotes where id = :'qsrv'), row(null::text, 0::bigint),
  'serveur : un brouillon n''a ni numéro ni total saisi');
select matches((select public_token from public.quotes where id = :'qsrv'), '^[A-Za-z0-9_-]{32}$',
  'serveur : jeton fourni remplacé par un jeton aléatoire');
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id, status) values (%L, %L, 'sent') $$, :'wa', :'ca'),
  '55000', 'invalid_status_transition', 'serveur : une facture naît brouillon');
insert into public.invoices (workspace_id, contact_id, amount_paid, paid_at) values (:'wa', :'ca', 5000, now())
returning id as isrv \gset
select is((select row(amount_paid, paid_at) from public.invoices where id = :'isrv'), row(0::bigint, null::timestamptz),
  'serveur : amount_paid et paid_at forcés à zéro à la création');
delete from public.quotes where id = :'qsrv';
delete from public.invoices where id = :'isrv';
select tests.authenticate_as(:'alice');

-- ---------------------------------------------------------------------------
-- Totaux
-- ---------------------------------------------------------------------------
insert into public.quotes (workspace_id, contact_id) values (:'wa', :'ca') returning id as q1 \gset
insert into public.document_lines (workspace_id, quote_id, position, description, quantity, unit_price)
values (:'wa', :'q1', 0, 'Logo', 1.5, 1001) returning id as l1 \gset
insert into public.document_lines (workspace_id, quote_id, position, description, quantity, unit_price)
values (:'wa', :'q1', 1, 'Carte de visite', 2, 25000);
select is((select line_total from public.document_lines where id = :'l1'), 1502::bigint,
  'line_total = round(quantité × prix unitaire)');
select is((select row(subtotal, total) from public.quotes where id = :'q1'), row(51502::bigint, 51502::bigint),
  'le sous-total suit les lignes');

update public.quotes set discount = 1502 where id = :'q1';
select is((select total from public.quotes where id = :'q1'), 50000::bigint, 'total = sous-total − remise');
update public.quotes set discount = 999999 where id = :'q1';
select is((select total from public.quotes where id = :'q1'), 0::bigint, 'le total n''est jamais négatif');
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q1'),
  '55000', 'document_empty', 'un devis à 0 ne s''émet pas');
update public.quotes set discount = 0 where id = :'q1';

update public.document_lines set quantity = 3, line_total = 1 where id = :'l1';
select is((select line_total from public.document_lines where id = :'l1'), 3003::bigint,
  'line_total recalculé, jamais saisi');
delete from public.document_lines where id = :'l1';
select is((select subtotal from public.quotes where id = :'q1'), 50000::bigint, 'supprimer une ligne met à jour les totaux');
select throws_ok(
  format($$ update public.document_lines set quote_id = null, invoice_id = null where quote_id = %L $$, :'q1'),
  '55000', 'immutable_field', 'une ligne ne change pas de document');

-- Montants hors plage : message-clé traduisible, pas « bigint out of range ».
select throws_ok(format($$ insert into public.document_lines (workspace_id, quote_id, description, quantity, unit_price) values (%L, %L, 'x', 99999999, 9000000000000000000) $$, :'wa', :'q1'),
  '55000', 'amount_too_large', 'quantité × prix au-delà du plafond : amount_too_large');
select throws_ok(format($$ insert into public.document_lines (workspace_id, quote_id, description, quantity, unit_price) values (%L, %L, 'x', 2, 600000000000000) $$, :'wa', :'q1'),
  '55000', 'amount_too_large', 'ligne > 10^15 : amount_too_large');
select throws_ok(format($$ update public.quotes set discount = 2000000000000000 where id = %L $$, :'q1'),
  '55000', 'amount_too_large', 'remise > 10^15 : amount_too_large');
insert into public.document_lines (workspace_id, quote_id, description, quantity, unit_price)
values (:'wa', :'q1', 'Gros', 1, 999999999950000) returning id as lbig \gset
select throws_ok(format($$ insert into public.document_lines (workspace_id, quote_id, description, quantity, unit_price) values (%L, %L, 'x', 1, 1) $$, :'wa', :'q1'),
  '55000', 'amount_too_large', 'sous-total au plafond (10^15) accepté, au-delà : amount_too_large');
delete from public.document_lines where id = :'lbig';

-- Quantité : 2 décimales au plus, refusée sinon (jamais arrondie en silence).
select throws_ok(format($$ insert into public.document_lines (workspace_id, quote_id, description, quantity, unit_price) values (%L, %L, 'x', 1.005, 333) $$, :'wa', :'q1'),
  '55000', 'quantity_too_precise', 'quantité à 3 décimales refusée, pas arrondie');
insert into public.document_lines (workspace_id, quote_id, description, quantity, unit_price)
values (:'wa', :'q1', 'Heures', 1.25, 333) returning id as lq \gset
select is((select row(quantity, line_total) from public.document_lines where id = :'lq'), row(1.25::numeric, 416::bigint),
  'quantité à 2 décimales gardée telle quelle : round(1,25 × 333) = 416');
delete from public.document_lines where id = :'lq';

insert into public.quotes (workspace_id, contact_id) values (:'wa', :'ca') returning id as qempty \gset
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'qempty'),
  '55000', 'document_empty', 'un devis sans ligne ne s''émet pas');

-- ---------------------------------------------------------------------------
-- Numérotation et cycle de vie des devis
-- ---------------------------------------------------------------------------
update public.quotes set status = 'sent' where id = :'q1';
select is((select number from public.quotes where id = :'q1'), format('D-%s-0001', :y),
  'premier devis émis : D-AAAA-0001 (le devis vide n''a rien consommé)');
select isnt((select sent_at from public.quotes where id = :'q1'), null, 'sent_at renseigné à l''envoi');
select throws_ok(format($$ delete from public.document_lines where quote_id = %L $$, :'q1'),
  '55000', 'document_empty', 'devis envoyé : on ne retire pas toutes ses lignes');
select throws_ok(format($$ update public.quotes set discount = 999999 where id = %L $$, :'q1'),
  '55000', 'document_empty', 'devis envoyé : pas de remise qui ramène le total à 0');
select is((select total from public.quotes where id = :'q1'), 50000::bigint, 'devis envoyé : total intact après les refus');

select tests.new_quote(:'wa', :'ca') as q2 \gset
select tests.new_quote(:'wa', :'ca') as q3 \gset
update public.quotes set status = 'sent' where id = :'q3';
update public.quotes set status = 'sent' where id = :'q2';
select results_eq(
  format($$ select number from public.quotes where id in (%L, %L) order by number $$, :'q2', :'q3'),
  array[format('D-%s-0002', :y), format('D-%s-0003', :y)],
  'numéros suivants, dans l''ordre d''émission'
);
select is((select number from public.quotes where id = :'q3'), format('D-%s-0002', :y),
  'le numéro suit l''ordre d''émission, pas de création');

-- Une émission annulée rend son numéro : pas de trou.
select tests.new_quote(:'wa', :'ca') as q4 \gset
savepoint before_send;
update public.quotes set status = 'sent' where id = :'q4';
select is((select number from public.quotes where id = :'q4'), format('D-%s-0004', :y), 'numéro 4 attribué');
rollback to savepoint before_send;
select tests.new_quote(:'wa', :'ca') as q5 \gset
select throws_ok(format($$ update public.quotes set status = 'declined' where id = %L $$, :'q5'),
  '55000', 'invalid_status_transition', 'un brouillon ne passe pas directement à refusé (pas de numéro brûlé)');
update public.quotes set status = 'sent' where id = :'q5';
select is((select number from public.quotes where id = :'q5'), format('D-%s-0004', :y),
  'après annulation de la transaction, le numéro 4 est réattribué (sans trou)');

select throws_ok(format($$ update public.quotes set status = 'draft' where id = %L $$, :'q5'),
  '55000', 'invalid_status_transition', 'un devis émis ne redevient pas brouillon');
update public.quotes set status = 'declined' where id = :'q5';
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q5'),
  '55000', 'invalid_status_transition', 'un devis refusé est final');
select throws_ok(format($$ update public.quotes set number = 'D-2000-0001' where id = %L $$, :'q5'),
  '42501', null, 'un numéro ne se modifie pas');
select throws_ok(
  format($$ select public.next_document_number(%L, 'quote') $$, :'wa'),
  '42501', null, 'next_document_number n''est pas appelable depuis le navigateur (pas de numéro brûlé)');
select is((select last_value from public.number_sequences where workspace_id = :'wa' and doc_type = 'quote' and year = :y),
  4, 'number_sequences lisible par le membre : dernière valeur 4');

-- Validité dépassée : ni envoi, ni renvoi après expiration (le client ne pourrait pas accepter).
select tests.new_quote(:'wa', :'ca') as q6 \gset
update public.quotes set valid_until = :'today'::date - 1 where id = :'q6';
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q6'),
  '55000', 'quote_valid_until_past', 'devis dont la validité est passée : envoi refusé');
select is((select number from public.quotes where id = :'q6'), null, 'envoi refusé : aucun numéro consommé');
update public.quotes set valid_until = :'today'::date, status = 'sent' where id = :'q6';
select is((select number from public.quotes where id = :'q6'), format('D-%s-0005', :y), 'valable jusqu''à aujourd''hui : envoyé');
update public.quotes set status = 'expired' where id = :'q6';
update public.quotes set valid_until = :'today'::date - 1 where id = :'q6';
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q6'),
  '55000', 'quote_valid_until_past', 'devis expiré : pas de renvoi sans nouvelle date de validité');
update public.quotes set valid_until = :'today'::date + 30, status = 'sent' where id = :'q6';
select is((select row(status::text, number) from public.quotes where id = :'q6'), row('sent'::text, format('D-%s-0005', :y)),
  'devis expiré renvoyé avec une nouvelle validité : même numéro');

-- Sémantique de verrouillage : la séquence est lue avec FOR UPDATE, et la ligne
-- de séquence est verrouillée par la transaction qui émet jusqu'à sa fin. Le test
-- à deux sessions réelles est scripts/test-db-concurrency.sh.
reset role;
select matches(
  pg_get_functiondef('public.next_document_number(uuid, public.doc_type)'::regprocedure),
  '(?i)select.*from public\.number_sequences.*for update',
  'next_document_number lit la séquence avec SELECT … FOR UPDATE'
);
create extension if not exists pgrowlocks with schema extensions;
select ok(
  exists (
    select 1
    from extensions.pgrowlocks('public.number_sequences') l
    where pg_backend_pid() = any (l.pids)
  ),
  'la ligne de séquence reste verrouillée par la transaction qui émet jusqu''à sa fin'
);
-- Limite Découverte : verrou commun aux devis et aux factures, posé avant celui de la
-- séquence (effet à deux sessions vérifié par scripts/test-db-concurrency.sh, cas 4).
select matches(
  pg_get_functiondef('public.next_document_number(uuid, public.doc_type)'::regprocedure),
  '(?i)from public\.workspaces w where w\.id = p_workspace_id for no key update.*from public\.number_sequences',
  'next_document_number verrouille le workspace (FOR NO KEY UPDATE) avant la séquence'
);
select has_index('public', 'quotes', 'quotes_workspace_id_number_key', 'numéro de devis unique par workspace');
select has_index('public', 'invoices', 'invoices_workspace_id_number_key', 'numéro de facture unique par workspace');
select col_has_check('public', 'quotes', 'public_token', 'format du jeton de devis contrôlé');
select col_has_check('public', 'invoices', 'public_token', 'format du jeton de facture contrôlé');
select tests.authenticate_as(:'alice');

-- ---------------------------------------------------------------------------
-- Factures : depuis un devis accepté, conditions d'émission.
-- ---------------------------------------------------------------------------
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id, quote_id) values (%L, %L, %L) $$, :'wa', :'ca', :'q3'),
  '55000', 'quote_not_accepted', 'pas de facture depuis un devis seulement envoyé');
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id, quote_id) values (%L, %L, %L) $$, :'wa', :'ca', :'q4'),
  '55000', 'quote_not_accepted', 'pas de facture depuis un devis brouillon');
update public.quotes set status = 'accepted' where id = :'q1';
select tests.new_invoice(:'wa', :'ca', 450000, :'q1') as i1 \gset
select throws_ok(format($$ update public.invoices set quote_id = %L where id = %L $$, :'q3', :'i1'),
  '55000', 'quote_not_accepted', 'le devis lié reste un devis accepté');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i1'),
  '55000', 'workspace_tax_info_missing', 'pas de facture émise sans NIF, STAT et régime fiscal');
update public.workspaces set nif = '1234567890', stat = '12345 11 2026 0 00001', tax_regime = 'tva' where id = :'wa';
select lives_ok(format($$ update public.workspaces set default_currency = 'EUR' where id = %L $$, :'wa'),
  'devise par défaut modifiable tant qu''aucune facture n''est émise');
update public.workspaces set default_currency = 'MGA' where id = :'wa';

insert into public.invoices (workspace_id, contact_id) values (:'wa', :'ca') returning id as iempty \gset
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'iempty'),
  '55000', 'document_empty', 'une facture sans ligne ne s''émet pas');
select throws_ok(format($$ update public.invoices set status = 'cancelled' where id = %L $$, :'iempty'),
  '55000', 'invalid_status_transition', 'un brouillon ne s''annule pas (il se supprime)');
select is(tests.affected(format($$ delete from public.invoices where id = %L $$, :'iempty')), 1,
  'un brouillon se supprime');

update public.invoices set due_on = :'today'::date - 1 where id = :'i1';
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i1'),
  '55000', 'invoice_due_before_issue', 'échéance passée : message traduisible');

-- Date saisie par le serveur sur le brouillon : remplacée par la date d'émission.
reset role;
update public.invoices set issued_on = '2020-01-01', exchange_rate = 5 where id = :'i1';
select tests.authenticate_as(:'alice');
update public.invoices set status = 'sent', due_on = :'today'::date + 30 where id = :'i1';
select is((select number from public.invoices where id = :'i1'), format('F-%s-0001', :y),
  'première facture : F-AAAA-0001 (séquence propre, aucun numéro consommé par les refus)');
select is((select issued_on from public.invoices where id = :'i1'), :'today'::date,
  'date d''émission = aujourd''hui à Antananarivo, jamais antidatée');
select is((select exchange_rate from public.invoices where id = :'i1'), 1::numeric,
  'même devise que le workspace : taux 1');
select is((select snapshot #>> '{client,name}' from public.invoices where id = :'i1'), 'Rakoto',
  'copie figée du client à l''émission');
select throws_ok(format($$ update public.workspaces set default_currency = 'EUR' where id = %L $$, :'wa'),
  '55000', 'default_currency_locked', 'devise par défaut figée dès qu''une facture est émise');
select lives_ok(format($$ update public.workspaces set default_currency = 'MGA', name = 'Studio Alice' where id = %L $$, :'wa'),
  'le reste du profil reste modifiable');
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id, quote_id) values (%L, %L, %L) $$, :'wa', :'ca', :'q1'),
  '23505', null, 'un devis ne devient qu''une seule facture');

-- Devise étrangère : taux obligatoire.
select tests.new_invoice(:'wa', :'ca', 10000) as ieur \gset
update public.invoices set currency = 'EUR' where id = :'ieur';
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'ieur'),
  '55000', 'exchange_rate_required', 'facture EUR dans un workspace MGA : taux obligatoire');
update public.invoices set exchange_rate = 4950.5, status = 'sent' where id = :'ieur';
select is((select row(number, exchange_rate) from public.invoices where id = :'ieur'),
  row(format('F-%s-0002', :y), 4950.5::numeric), 'facture EUR émise avec son taux');

-- Les numéros sont propres à chaque workspace.
select tests.authenticate_as(:'bob');
insert into public.contacts (workspace_id, name, email) values (:'wb', 'Client', 'c@example.test') returning id as cb \gset
select tests.new_quote(:'wb', :'cb') as qb \gset
update public.quotes set status = 'sent' where id = :'qb';
select is((select number from public.quotes where id = :'qb'), format('D-%s-0001', :y),
  'Bob commence sa propre numérotation à 0001');
select tests.authenticate_as(:'alice');

-- ---------------------------------------------------------------------------
-- Facture figée après émission
-- ---------------------------------------------------------------------------
select id as il1 from public.document_lines where invoice_id = :'i1' \gset
select throws_ok(format($$ update public.document_lines set unit_price = 1 where id = %L $$, :'il1'),
  '55000', 'document_frozen', 'facture émise : ligne non modifiable');
select throws_ok(format($$ insert into public.document_lines (workspace_id, invoice_id, description, unit_price) values (%L, %L, 'x', 1) $$, :'wa', :'i1'),
  '55000', 'document_frozen', 'facture émise : pas de nouvelle ligne');
select throws_ok(format($$ delete from public.document_lines where id = %L $$, :'il1'),
  '55000', 'document_frozen', 'facture émise : ligne non supprimable');
select throws_ok(format($$ update public.invoices set discount = 1 where id = %L $$, :'i1'),
  '55000', 'document_frozen', 'facture émise : remise et total non modifiables');
select throws_ok(format($$ update public.invoices set currency = 'EUR' where id = %L $$, :'i1'),
  '55000', 'document_frozen', 'facture émise : devise non modifiable');
select throws_ok(format($$ update public.invoices set contact_id = %L where id = %L $$, :'ca2', :'i1'),
  '55000', 'document_frozen', 'facture émise : client non modifiable');
select throws_ok(format($$ update public.invoices set amount_paid = 999999 where id = %L $$, :'i1'),
  '42501', null, 'amount_paid non modifiable : dérivé des paiements');
reset role;
update public.invoices set amount_paid = 999999, paid_at = now() where id = :'i1';
select is((select row(amount_paid, paid_at) from public.invoices where id = :'i1'), row(0::bigint, null::timestamptz),
  'même le serveur ne force pas amount_paid : recalculé depuis les paiements');
select throws_ok(format($$ update public.invoices set snapshot = '{}' where id = %L $$, :'i1'),
  '55000', 'document_frozen', 'copie figée non modifiable');
select tests.authenticate_as(:'alice');
select throws_ok(format($$ update public.invoices set pdf_path = 'autre-workspace/f.pdf' where id = %L $$, :'i1'),
  '23514', null, 'pdf_path reste dans le dossier du workspace');
select lives_ok(
  format($$ update public.invoices set pdf_path = %L where id = %L $$, :'wa' || '/invoices/f1.pdf', :'i1'),
  'facture émise : le PDF se pose une fois');
select throws_ok(
  format($$ update public.invoices set pdf_path = %L where id = %L $$, :'wa' || '/invoices/autre.pdf', :'i1'),
  '55000', 'document_frozen', 'facture émise : le PDF posé ne se remplace pas');
select throws_ok(format($$ update public.invoices set pdf_path = null where id = %L $$, :'i1'),
  '55000', 'document_frozen', 'facture émise : le PDF posé ne s''efface pas');
reset role;
select throws_ok(
  format($$ update public.invoices set pdf_path = %L where id = %L $$, :'wa' || '/invoices/autre.pdf', :'i1'),
  '55000', 'document_frozen', 'même le serveur ne remplace pas le PDF d''une facture émise');
select tests.authenticate_as(:'alice');

-- Transitions de statut.
select throws_ok(format($$ update public.invoices set status = 'paid' where id = %L $$, :'i1'),
  '55000', 'invoice_not_fully_paid', 'pas de « payée » sans paiement couvrant le total');
select throws_ok(format($$ update public.invoices set status = 'draft' where id = %L $$, :'i1'),
  '55000', 'invalid_status_transition', 'facture émise : ne redevient pas brouillon');
select throws_ok(format($$ update public.invoices set status = 'overdue' where id = %L $$, :'i1'),
  '55000', 'invalid_status_transition', 'pas « en retard » avant l''échéance');
-- Échéance réellement passée : on vieillit la facture (gardes désactivées le temps de l'écriture).
reset role;
alter table public.invoices disable trigger t10_guard;
update public.invoices set issued_on = :'today'::date - 40, due_on = :'today'::date - 10 where id = :'i1';
alter table public.invoices enable trigger t10_guard;
select tests.authenticate_as(:'alice');
update public.invoices set status = 'overdue' where id = :'i1';
select is((select status::text from public.invoices where id = :'i1'), 'overdue', 'échéance passée : envoyée → en retard');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i1'),
  '55000', 'invalid_status_transition', 'échéance passée : en retard ne redevient pas envoyée');
reset role;
alter table public.invoices disable trigger t10_guard;
update public.invoices set issued_on = :'today'::date, due_on = :'today'::date where id = :'i1';
alter table public.invoices enable trigger t10_guard;
select tests.authenticate_as(:'alice');
update public.invoices set status = 'sent' where id = :'i1';
select is((select status::text from public.invoices where id = :'i1'), 'sent', 'échéance non passée : en retard → envoyée');
update public.invoices set status = 'cancelled' where id = :'ieur';
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'ieur'),
  '55000', 'invalid_status_transition', 'une facture annulée est finale');
select is(tests.affected(format($$ delete from public.invoices where id = %L $$, :'i1')), 0,
  'une facture émise n''est jamais supprimée');

-- Numérotation continue (offre Lancement : pas de limite mensuelle).
select tests.new_invoice(:'wa', :'ca') as i3 \gset
update public.invoices set status = 'sent' where id = :'i3';
select is((select number from public.invoices where id = :'i3'), format('F-%s-0003', :y), 'troisième facture du mois');
select tests.new_invoice(:'wa', :'ca') as i4 \gset
update public.invoices set status = 'sent' where id = :'i4';
select is((select number from public.invoices where id = :'i4'), format('F-%s-0004', :y),
  'offre Lancement : quatrième facture du mois émise, toujours sans trou');
select throws_ok(format($$ update public.invoices set status = 'overdue' where id = %L $$, :'i4'),
  '55000', 'invalid_status_transition', 'pas « en retard » sans échéance');

-- ---------------------------------------------------------------------------
-- Devis figé une fois accepté (modifiable tant qu'il est seulement envoyé)
-- ---------------------------------------------------------------------------
select lives_ok(format($$ insert into public.document_lines (workspace_id, quote_id, description, unit_price) values (%L, %L, 'Option', 10000) $$, :'wa', :'q2'),
  'devis envoyé : encore modifiable');
update public.quotes set pdf_path = :'wa' || '/quotes/q2-v1.pdf' where id = :'q2';
select lives_ok(format($$ update public.quotes set pdf_path = %L where id = %L $$, :'wa' || '/quotes/q2-v2.pdf', :'q2'),
  'devis envoyé : PDF régénérable après modification');
update public.quotes set status = 'accepted' where id = :'q2';
select isnt((select accepted_at from public.quotes where id = :'q2'), null, 'accepted_at renseigné');
select throws_ok(format($$ update public.quotes set pdf_path = %L where id = %L $$, :'wa' || '/quotes/q2-v3.pdf', :'q2'),
  '55000', 'document_frozen', 'devis accepté : le PDF posé ne se remplace pas');
select lives_ok(format($$ update public.quotes set pdf_path = %L where id = %L $$, :'wa' || '/quotes/q1.pdf', :'q1'),
  'devis accepté sans PDF : le PDF se pose une fois');
select throws_ok(format($$ update public.document_lines set unit_price = 1 where quote_id = %L $$, :'q2'),
  '55000', 'document_frozen', 'devis accepté : lignes figées');
select throws_ok(format($$ update public.quotes set discount = 5 where id = %L $$, :'q2'),
  '55000', 'document_frozen', 'devis accepté : remise figée');
select throws_ok(format($$ update public.quotes set status = 'declined' where id = %L $$, :'q2'),
  '55000', 'document_frozen', 'devis accepté : statut définitif');

-- ---------------------------------------------------------------------------
-- Jeton public
-- ---------------------------------------------------------------------------
select matches((select public_token from public.quotes where id = :'q1'), '^[A-Za-z0-9_-]{32}$',
  'jeton public de 32 caractères URL-safe');
select is((select count(distinct public_token)::int from public.quotes), (select count(*)::int from public.quotes),
  'jetons tous distincts');
select throws_ok(format($$ update public.quotes set public_token = 'x' where id = %L $$, :'q3'),
  '42501', null, 'le jeton public ne se modifie pas (navigateur)');
reset role;
select throws_ok(format($$ update public.quotes set public_token = 'x' where id = %L $$, :'q3'),
  '55000', 'immutable_field', 'le jeton public ne se modifie pas (serveur)');

select * from finish();
rollback;
