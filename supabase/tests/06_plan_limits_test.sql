-- Offre Découverte (spec « Offres et limites ») : 3 devis + factures envoyés par mois
-- calendaire, 20 contacts actifs. Offres Lancement et au-dessus : illimitées.
-- Émissions simultanées des deux types : scripts/test-db-concurrency.sh, cas 4.
begin;
\ir helpers.psql
select plan(20);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
select extract(year from now() at time zone 'Indian/Antananarivo')::int as y \gset
reset role;
update public.workspaces set nif = '1234567890', stat = '12345112026000001', tax_regime = 'tva' where id = :'wa';
select tests.authenticate_as(:'alice');

select is((select plan::text from public.workspaces where id = :'wa'), 'decouverte', 'offre par défaut : Découverte');

insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000') returning id as ca \gset

-- ---------------------------------------------------------------------------
-- 3 devis + factures envoyés par mois, tous types confondus.
-- ---------------------------------------------------------------------------
select tests.new_quote(:'wa', :'ca') as q1 \gset
select tests.new_invoice(:'wa', :'ca') as i1 \gset
select tests.new_quote(:'wa', :'ca') as q2 \gset
select tests.new_invoice(:'wa', :'ca') as i2 \gset
select tests.new_quote(:'wa', :'ca') as q3 \gset
select lives_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q1'), '1er document du mois (devis)');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i1'), '2e document du mois (facture)');
select lives_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q2'), '3e document du mois (devis)');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i2'),
  '55000', 'free_limit_reached', '4e document du mois (facture) refusé');
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q3'),
  '55000', 'free_limit_reached', '4e document du mois (devis) refusé');
select is((select row(status::text, number) from public.invoices where id = :'i2'), row('draft'::text, null::text),
  'document refusé : reste brouillon, sans numéro');
select lives_ok($$ select tests.new_quote(
    (select id from public.workspaces), (select id from public.contacts limit 1)) $$,
  'les brouillons restent illimités');

-- Renvoyer un devis expiré ne compte pas comme un nouvel envoi.
update public.quotes set status = 'expired' where id = :'q1';
select lives_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q1'),
  'devis expiré renvoyé à la limite : accepté (pas un nouveau document)');

-- Un envoi du mois précédent ne compte pas.
reset role;
alter table public.quotes disable trigger t10_guard;
update public.quotes
set sent_at = (date_trunc('month', now() at time zone 'Indian/Antananarivo') - interval '1 day') at time zone 'Indian/Antananarivo'
where id = :'q2';
alter table public.quotes enable trigger t10_guard;
select tests.authenticate_as(:'alice');
update public.invoices set status = 'sent' where id = :'i2';
select is((select number from public.invoices where id = :'i2'), format('F-%s-0002', :y),
  'envoi du mois précédent non compté : la facture part, numérotée sans trou');
select throws_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q3'),
  '55000', 'free_limit_reached', 'de nouveau 3 envois ce mois-ci : refusé');

-- Offre Lancement (changée par le serveur) : illimité.
reset role;
update public.workspaces set plan = 'lancement' where id = :'wa';
select tests.authenticate_as(:'alice');
select lives_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, :'q3'),
  'offre Lancement : 4e envoi du mois accepté');
select is((select number from public.quotes where id = :'q3'), format('D-%s-0003', :y),
  'numéro suivant, aucun numéro perdu par les refus');

-- ---------------------------------------------------------------------------
-- 20 contacts actifs au plus.
-- ---------------------------------------------------------------------------
reset role;
update public.workspaces set plan = 'decouverte' where id = :'wa';
select tests.authenticate_as(:'alice');
insert into public.contacts (workspace_id, name, phone)
select :'wa', 'Client ' || n, '+26134000' || lpad(n::text, 4, '0') from generate_series(2, 20) n;
select is((select count(*)::int from public.contacts where archived_at is null), 20, '20 contacts actifs');
select throws_ok(format($$ insert into public.contacts (workspace_id, name, phone) values (%L, 'Client 21', '+261340009999') $$, :'wa'),
  '55000', 'contact_limit_reached', '21e contact actif refusé');

update public.contacts set archived_at = now() where name = 'Client 20' returning id as archived \gset
select lives_ok(format($$ insert into public.contacts (workspace_id, name, phone) values (%L, 'Client 21', '+261340009999') $$, :'wa'),
  'après un archivage, un nouveau contact est accepté');
select throws_ok(format($$ update public.contacts set archived_at = null where id = %L $$, :'archived'),
  '55000', 'contact_limit_reached', 'désarchiver au-delà de 20 contacts actifs : refusé');
select lives_ok(format($$ update public.contacts set name = 'Client 1 bis' where id = %L $$, :'ca'),
  'modifier un contact actif reste possible à la limite');

-- Bob ne peut ni écrire chez Alice ni apprendre qu'elle est à la limite.
select tests.authenticate_as(:'bob');
select throws_ok(format($$ insert into public.contacts (workspace_id, name, phone) values (%L, 'Pirate', '+261340000000') $$, :'wa'),
  '42501', null, 'contact dans le workspace d''un autre : refusé par la RLS, sans révéler la limite');

reset role;
update public.workspaces set plan = 'lancement' where id = :'wa';
select tests.authenticate_as(:'alice');
select lives_ok(format($$ update public.contacts set archived_at = null where id = %L $$, :'archived'),
  'offre Lancement : contacts illimités');

select * from finish();
rollback;
