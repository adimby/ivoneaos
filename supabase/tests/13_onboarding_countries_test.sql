-- Accueil guidé sans données fiscales (onboarded_at), pays favoris des contacts et liste
-- ISO des pays acceptés par la base.
begin;
\ir helpers.psql
select plan(20);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset

-- ---------------------------------------------------------------------------
-- 1. onboarded_at : posé par la base quand nom, métier et adresse sont remplis.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice', 'MGA', 'Graphiste') as wa \gset

select is((select onboarded_at from public.workspaces where id = :'wa'), null,
  'sans adresse : accueil guidé pas terminé');
select throws_ok(format($$ update public.workspaces set onboarded_at = now() where id = %L $$, :'wa'),
  '42501', null, 'onboarded_at ne se saisit pas');
update public.workspaces set address = '   ' where id = :'wa';
select is((select onboarded_at from public.workspaces where id = :'wa'), null,
  'adresse vide : toujours pas terminé');
update public.workspaces set address = 'Lot II A 12, Antananarivo' where id = :'wa';
select isnt((select onboarded_at from public.workspaces where id = :'wa'), null,
  'nom, métier et adresse remplis : accueil guidé terminé, sans NIF ni STAT');
select is((select profile_completed_at from public.workspaces where id = :'wa'), null,
  'l''indicateur « profil terminé » (garantie 90 jours) attend toujours les données fiscales');
select onboarded_at as onboarded from public.workspaces where id = :'wa' \gset
update public.workspaces set address = null where id = :'wa';
select is((select onboarded_at from public.workspaces where id = :'wa'), :'onboarded'::timestamptz,
  'la date n''est jamais effacée');
reset role;
update public.workspaces set onboarded_at = null where id = :'wa';
select is((select onboarded_at from public.workspaces where id = :'wa'), :'onboarded'::timestamptz,
  'même le serveur ne la modifie pas');

-- Données fiscales ajoutées plus tard (avant la première facture) : profil terminé.
select tests.authenticate_as(:'alice');
update public.workspaces set nif = '3000123456', stat = '74111112020001234', tax_regime = 'tva' where id = :'wa';
select isnt((select profile_completed_at from public.workspaces where id = :'wa'), null,
  'NIF, STAT et régime ajoutés : profil terminé');
select is((select onboarded_at from public.workspaces where id = :'wa'), :'onboarded'::timestamptz,
  'la date d''accueil guidé ne bouge pas');

-- ---------------------------------------------------------------------------
-- 2. Pays favoris : 5 pays les plus utilisés par les contacts actifs, hors Madagascar.
-- ---------------------------------------------------------------------------
reset role;
update public.workspaces set plan = 'lancement' where id = :'wa';
insert into public.contacts (workspace_id, name, phone, country)
select :'wa', 'Contact ' || n, '+26134000' || lpad(n::text, 4, '0'), c
from (values ('MG', 6), ('FR', 4), ('MU', 2), ('JP', 3), ('CA', 1), ('BE', 1), ('DE', 1), ('US', 1)) as v(c, k),
     generate_series(1, 9) n
where n <= k;
-- Archivés : ignorés (ils feraient passer le Sénégal en tête).
insert into public.contacts (workspace_id, name, phone, country, archived_at)
select :'wa', 'Archivé ' || n, '+26133000' || lpad(n::text, 4, '0'), 'SN', now()
from generate_series(1, 9) n;

select tests.authenticate_as(:'alice');
select results_eq(
  format($$ select country, contacts from public.contact_top_countries(%L) $$, :'wa'),
  $$ values ('FR'::text, 4), ('JP', 3), ('MU', 2), ('BE', 1), ('CA', 1) $$,
  'les 5 pays les plus utilisés, du plus fréquent au moins fréquent (puis par code), sans MG ni archivés'
);

-- Autre workspace : la RLS s'applique (fonction SECURITY INVOKER).
select tests.authenticate_as(:'bob');
select public.create_workspace('Studio Bob') as wb \gset
select is((select count(*)::int from public.contact_top_countries(:'wa')), 0,
  'Bob ne voit pas les pays des contacts d''Alice');
select is((select count(*)::int from public.contact_top_countries(:'wb')), 0,
  'workspace sans contact : aucun pays');

select tests.as_anon();
select throws_ok(format($$ select * from public.contact_top_countries(%L) $$, :'wa'),
  '42501', null, 'anon ne peut pas appeler contact_top_countries');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Facture : toujours refusée sans NIF / STAT / régime (seulement au départ du brouillon).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'bob');
update public.workspaces set address = 'Ivandry', trade = 'Développeur' where id = :'wb';
select isnt((select onboarded_at from public.workspaces where id = :'wb'), null,
  'Bob a terminé l''accueil guidé sans données fiscales');
reset role;
insert into public.contacts (workspace_id, name, phone) values (:'wb', 'Client', '+261340009999') returning id as cb \gset
select tests.authenticate_as(:'bob');
select tests.new_invoice(:'wb', :'cb') as inv \gset
select is((select status::text from public.invoices where id = :'inv'), 'draft',
  'un brouillon de facture se prépare sans données fiscales');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'inv'),
  '55000', 'workspace_tax_info_missing', 'pas d''envoi sans NIF, STAT et régime fiscal');
update public.workspaces set nif = '3000123457', stat = '74111112020001235', tax_regime = 'impot_synthetique' where id = :'wb';
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'inv'),
  'données fiscales ajoutées : la même facture part');

-- ---------------------------------------------------------------------------
-- 4. Pays des contacts : seulement les codes ISO 3166-1 de la liste de l'application.
-- ---------------------------------------------------------------------------
select throws_ok(format($$ insert into public.contacts (workspace_id, name, phone, country)
  values (%L, 'Zed', '+261340001111', 'ZZ') $$, :'wb'),
  '23514', null, 'code inconnu refusé (ZZ)');
select throws_ok(format($$ update public.contacts set country = 'XK' where id = %L $$, :'cb'),
  '23514', null, 'code hors liste ISO refusé (XK)');
select lives_ok(format($$ update public.contacts set country = 'JP' where id = %L $$, :'cb'),
  'code de la liste accepté (JP)');

select * from finish();
rollback;
