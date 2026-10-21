-- Cron des rappels (réservation, envoi, reprise) et recherche des contacts.
begin;
\ir helpers.psql
select plan(33);

-- Base partagée avec les tests de bout en bout : leurs rappels dus fausseraient les
-- comptes. Notés envoyés le temps de ce test (annulé au rollback).
update public.reminders set notified_at = now() where notified_at is null;

select tests.create_user('alice@example.test') as alice \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
reset role;
update public.workspaces set plan = 'lancement' where id = :'wa';

insert into public.contacts (workspace_id, name, company_name, phone, tags)
values (:'wa', 'Rasoa (Soa), O''Brien', 'Atelier_Bleu', '+261340000000', '{graphisme,fidèle}')
returning id as ca \gset
insert into public.contacts (workspace_id, name, phone, archived_at)
values (:'wa', 'Archivé', '+261340000001', now()) returning id as carch \gset
select id as stage from public.pipeline_stages where workspace_id = :'wa' order by position limit 1 \gset
insert into public.deals (workspace_id, contact_id, stage_id, title, archived_at)
values (:'wa', :'ca', :'stage', 'Logo archivé', now()) returning id as darch \gset

-- 320 rappels dus (plus que ce qu'une liste d'identifiants dans l'URL supporte).
insert into public.reminders (workspace_id, contact_id, title, due_at)
select :'wa', :'ca', 'Relance ' || n, now() - make_interval(hours => n)
from generate_series(1, 320) n;
-- Exclus : fait, demain, contact archivé, opportunité archivée.
insert into public.reminders (workspace_id, contact_id, title, due_at, done_at)
values (:'wa', :'ca', 'Fait', now() - interval '1 hour', now());
insert into public.reminders (workspace_id, contact_id, title, due_at)
values (:'wa', :'ca', 'Demain', now() + interval '2 days');
insert into public.reminders (workspace_id, contact_id, title, due_at)
values (:'wa', :'carch', 'Contact archivé', now() - interval '1 hour');
insert into public.reminders (workspace_id, contact_id, deal_id, title, due_at)
values (:'wa', :'ca', :'darch', 'Opportunité archivée', now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- 1. Droits : fonctions du cron réservées au rôle serveur.
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select throws_ok($$ select * from public.claim_due_reminders(now() + interval '1 day') $$, '42501', null,
  'claim_due_reminders refusée à une personne connectée');
select throws_ok(format($$ update public.reminders set notify_attempts = 0 where workspace_id = %L $$, :'wa'), '42501', null,
  'notify_attempts : non modifiable par la personne connectée');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Réservation par lots, sans identifiants dans l'URL.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
create temp table batch1 as select * from public.claim_due_reminders(now() + interval '1 day', 200);
create temp table batch2 as select * from public.claim_due_reminders(now() + interval '1 day', 200);
create temp table batch3 as select * from public.claim_due_reminders(now() + interval '1 day', 200);
reset role;

select is((select count(*) from batch1), 200::bigint, 'premier lot : 200 rappels');
select is((select count(*) from batch2), 120::bigint, 'second lot : les 120 restants (lot 1 sous bail)');
select is((select count(*) from batch3), 0::bigint, 'plus rien : tout est sous bail');
select is((select count(*) from (select id from batch1 intersect select id from batch2) x), 0::bigint,
  'aucun rappel pris deux fois');
select is((select count(*) from (select title from batch1 union all select title from batch2) t
           where title in ('Fait', 'Demain', 'Contact archivé', 'Opportunité archivée')), 0::bigint,
  'exclus : fait, à venir, contact ou opportunité archivés');
select is((select contact_name from batch1 limit 1), 'Rasoa (Soa), O''Brien', 'nom du contact joint');
select is((select title from batch1 order by due_at limit 1), 'Relance 320', 'du plus ancien au plus récent');
select is((select count(*) from public.reminders where workspace_id = :'wa' and notified_at is not null), 0::bigint,
  'réserver ne marque pas notifié');

-- ---------------------------------------------------------------------------
-- 3. Envoi réussi, échec, envoi désactivé.
-- ---------------------------------------------------------------------------
select tests.as_service_role();
select is(public.mark_reminders_notified((select array_agg(id) from batch1), (select max(claimed_at) from batch1)), 200,
  '200 marqués notifiés');
select is(public.mark_reminders_notified((select array_agg(id) from batch1), (select max(claimed_at) from batch1)), 0,
  'idempotent');
select is(public.mark_reminders_notified((select array_agg(id) from batch2), now() - interval '1 second'), 0,
  'autre horodatage de réservation : rien n''est marqué');
select is(array(select public.release_reminders(
    (select array_agg(id) from (select id from batch2 order by due_at limit 60) x), (select max(claimed_at) from batch2), true)),
  '{}'::uuid[], 'premier échec : aucun rappel abandonné');
select public.release_reminders((select array_agg(id) from (select id from batch2 order by due_at offset 60) x),
  (select max(claimed_at) from batch2), false);
reset role;

select is((select count(*) from public.reminders where workspace_id = :'wa' and notified_at is not null and notify_claimed_at is null), 200::bigint,
  'notifiés : bail levé');
select is((select count(*) from public.reminders where id in (select id from batch2) and notify_claimed_at is null), 120::bigint,
  'non envoyés : bail levé');
select is((select count(*) from public.reminders where workspace_id = :'wa' and notify_attempts = 1), 60::bigint, 'échec : un essai compté');

select tests.as_service_role();
select is((select count(*) from public.claim_due_reminders(now() + interval '1 day', 500)), 120::bigint,
  'non envoyés repris au passage suivant');
reset role;

-- Bail expiré (passage interrompu) : repris ; essais épuisés : ignorés.
update public.reminders set notify_claimed_at = now() - interval '1 hour' where id in (select id from batch2);
update public.reminders set notify_attempts = 3 where id in (select id from batch2 order by due_at limit 60);
select tests.as_service_role();
create temp table batch4 as select * from public.claim_due_reminders(now() + interval '1 day', 500);
reset role;
select is((select count(*) from batch4), 60::bigint, 'bail expiré repris, essais épuisés ignorés');

-- Troisième échec : le rappel est renvoyé comme abandonné (journalisé par le cron).
select id as r3 from batch4 order by due_at limit 1 \gset
update public.reminders set notify_attempts = 2 where id = :'r3';
select tests.as_service_role();
select is(array(select public.release_reminders(array[:'r3'::uuid], (select claimed_at from batch4 where id = :'r3'), true)),
  array[:'r3'::uuid], 'troisième échec : rappel signalé comme abandonné');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Rappel repoussé : de nouveau à notifier.
-- ---------------------------------------------------------------------------
select id as r1 from batch1 limit 1 \gset
select tests.authenticate_as(:'alice');
update public.reminders set due_at = now() + interval '1 day' where id = :'r1';
reset role;
select is((select row(notified_at, notify_claimed_at, notify_attempts)::text from public.reminders where id = :'r1'),
  row(null::timestamptz, null::timestamptz, 0::smallint)::text, 'repoussé : notification remise à zéro');

-- Repoussé pendant l'envoi : le cron a réservé le rappel, la personne le repousse,
-- puis l'envoi réussit. Le rappel n'est pas marqué notifié (il le sera à sa nouvelle date).
select id as r2 from batch4 where id <> :'r3' limit 1 \gset
select tests.authenticate_as(:'alice');
update public.reminders set due_at = now() + interval '3 days' where id = :'r2';
reset role;
select tests.as_service_role();
select is(public.mark_reminders_notified(array[:'r2'::uuid], (select claimed_at from batch4 where id = :'r2')), 0,
  'repoussé pendant l''envoi : pas marqué notifié');
reset role;
select is((select notified_at from public.reminders where id = :'r2'), null::timestamptz,
  'repoussé pendant l''envoi : notified_at reste vide');

-- ---------------------------------------------------------------------------
-- 5. Recherche des contacts (champ calculé search_text).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select is(public.search_text(c), 'Rasoa (Soa), O''Brien Atelier_Bleu graphisme fidèle') from public.contacts c where id = :'ca';
select is((select count(*) from public.contacts c where public.search_text(c) ilike '%Rasoa (Soa)%'), 1::bigint,
  'parenthèses et virgules cherchées telles quelles');
select is((select count(*) from public.contacts c where public.search_text(c) ilike '%fidèle%'), 1::bigint,
  'étiquettes cherchées');
reset role;
select tests.as_anon();
select throws_ok($$ select public.search_text(c) from public.contacts c $$, '42501', null, 'anon : refusé');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Rappels d'un contact ou d'une opportunité archivés (champ calculé about_active).
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select is((select public.about_active(r) from public.reminders r where title = 'Relance 1'), true, 'rappel actif');
select is((select public.about_active(r) from public.reminders r where title = 'Contact archivé'), false,
  'contact archivé : hors Aujourd''hui');
select is((select public.about_active(r) from public.reminders r where title = 'Opportunité archivée'), false,
  'opportunité archivée : hors Aujourd''hui');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Pipeline : nombre et total par étape (pipeline_totals), hors archivés.
-- ---------------------------------------------------------------------------
insert into public.deals (workspace_id, contact_id, stage_id, title, amount, currency) values
  (:'wa', :'ca', :'stage', 'A', 100000, 'MGA'),
  (:'wa', :'ca', :'stage', 'B', 50000, 'MGA'),
  (:'wa', :'ca', :'stage', 'C', null, 'EUR'),
  (:'wa', :'carch', :'stage', 'Contact archivé', 999, 'MGA');
select tests.authenticate_as(:'alice');
select is((select row(deal_count, amount_sum)::text from public.pipeline_totals(:'wa') where currency = 'MGA'),
  row(2, 150000::bigint)::text, 'MGA : 2 opportunités, 150 000 (contact et opportunité archivés exclus)');
select is((select row(deal_count, amount_sum)::text from public.pipeline_totals(:'wa') where currency = 'EUR'),
  row(1, null::bigint)::text, 'EUR : comptée, sans montant');
reset role;
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select is((select count(*) from public.pipeline_totals(:'wa')), 0::bigint, 'autre workspace : rien (RLS)');
reset role;

select * from finish();
rollback;
