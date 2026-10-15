-- RLS : deux freelances, chaque table isolée en lecture et en écriture ; anon n'atteint rien.
begin;
\ir helpers.psql
select plan(98);

-- ---------------------------------------------------------------------------
-- Données : Alice (workspace A, complet) et Bob (workspace B).
-- ---------------------------------------------------------------------------
select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset

select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
reset role;

update public.workspaces set nif = '1234567890', stat = '12345 11 2026 0 00001', tax_regime = 'impot_synthetique'
where id = :'wa';
insert into public.onboarding_answers (workspace_id, answers) values (:'wa', '{"trade": "design"}');
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000')
returning id as ca \gset
select id as sa from public.pipeline_stages where workspace_id = :'wa' and position = 0 \gset
insert into public.deals (workspace_id, contact_id, stage_id, title, amount)
values (:'wa', :'ca', :'sa', 'Logo', 450000) returning id as da \gset
insert into public.activities (workspace_id, contact_id, deal_id, kind, body)
values (:'wa', :'ca', :'da', 'call', 'Premier appel');
insert into public.reminders (workspace_id, contact_id, deal_id, title, due_at)
values (:'wa', :'ca', :'da', 'Relancer', now() + interval '1 day');
insert into public.quotes (workspace_id, contact_id, deal_id) values (:'wa', :'ca', :'da')
returning id as qa \gset
insert into public.document_lines (workspace_id, quote_id, description, unit_price)
values (:'wa', :'qa', 'Création du logo', 450000);
update public.quotes set status = 'sent' where id = :'qa';
update public.quotes set status = 'accepted' where id = :'qa';
insert into public.invoices (workspace_id, contact_id, quote_id) values (:'wa', :'ca', :'qa')
returning id as ia \gset
insert into public.document_lines (workspace_id, invoice_id, description, unit_price)
values (:'wa', :'ia', 'Création du logo', 450000);
update public.invoices set status = 'sent' where id = :'ia';
insert into public.payment_accounts (workspace_id, provider, status, encrypted_api_key, encrypted_signing_secret)
values (:'wa', 'papi', 'connected', 'enc:key', 'enc:secret') returning id as pa \gset
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_url)
values (:'wa', :'ia', :'pa', 'papi', 'IVN-a-1', 'https://app.papi.mg/pay/abc') returning id as pla \gset
insert into public.payments (workspace_id, invoice_id, payment_link_id, provider, method, amount, currency, provider_reference)
values (:'wa', :'ia', :'pla', 'papi', 'MVOLA', 100000, 'MGA', 'PAPI-REF-1');
insert into public.webhook_events (provider, raw_body) values ('papi', '{}');

-- Tables rattachées à un workspace.
create function tests.ws_tables() returns text[] language sql as $$
  select array['onboarding_answers', 'contacts', 'pipeline_stages', 'deals', 'activities',
               'reminders', 'quotes', 'invoices', 'document_lines', 'number_sequences',
               'payment_accounts', 'payment_links', 'payments', 'workspace_members'];
$$;

create function tests.check_reads_isolated(ws uuid) returns setof text language plpgsql as $$
declare
  t text;
  n integer;
begin
  foreach t in array tests.ws_tables() loop
    execute format('select count(*) from public.%I where workspace_id = $1', t) into n using ws;
    return next is(n, 0, t || ' : aucune ligne d''un autre workspace n''est lisible');
  end loop;
end;
$$;

create function tests.check_writes_isolated(ws uuid) returns setof text language plpgsql as $$
declare
  t text;
  assignment text;
begin
  -- Une colonne que le navigateur a le droit de modifier, pour chaque table.
  for t, assignment in
    select * from (values
      ('onboarding_answers', 'updated_at = now()'), ('contacts', 'updated_at = now()'),
      ('pipeline_stages', 'name = name'), ('deals', 'updated_at = now()'),
      ('activities', 'updated_at = now()'), ('reminders', 'updated_at = now()'),
      ('quotes', 'updated_at = now()'), ('invoices', 'updated_at = now()'),
      ('document_lines', 'updated_at = now()'), ('payments', 'updated_at = now()')
    ) v
  loop
    return next is(
      tests.affected(format('update public.%I set %s where workspace_id = %L', t, assignment, ws)),
      0, t || ' : mise à jour d''un autre workspace sans effet');
  end loop;
  foreach t in array array['onboarding_answers', 'pipeline_stages', 'activities', 'reminders',
                           'quotes', 'invoices', 'document_lines', 'payments'] loop
    return next is(
      tests.affected(format('delete from public.%I where workspace_id = %L', t, ws)),
      0, t || ' : suppression dans un autre workspace sans effet');
  end loop;
end;
$$;

create function tests.check_anon_blocked() returns setof text language plpgsql as $$
declare
  t text;
begin
  foreach t in array tests.ws_tables() || array['workspaces', 'profiles', 'webhook_events'] loop
    return next throws_ok(format('select 1 from public.%I limit 1', t), '42501', null,
                          t || ' : aucun accès anon');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lecture
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select is((select count(*)::int from public.contacts), 1, 'Alice voit son contact');
select is((select count(*)::int from public.payments), 1, 'Alice voit son paiement');

select tests.authenticate_as(:'bob');
select is((select count(*)::int from public.pipeline_stages), 6, 'Bob voit ses propres étapes');
select * from tests.check_reads_isolated(:'wa');
select is((select count(*)::int from public.workspaces where id = :'wa'), 0, 'workspaces : isolé');
select is((select count(*)::int from public.profiles), 1, 'profiles : Bob ne voit que son profil');
select is((select count(*)::int from public.profiles where user_id = :'alice'), 0, 'profiles : profil d''Alice invisible');
select throws_ok('select 1 from public.webhook_events', '42501', null, 'webhook_events : refusé à authenticated');

-- ---------------------------------------------------------------------------
-- Écriture : insertion dans le workspace d'Alice refusée partout.
-- ---------------------------------------------------------------------------
select throws_ok(format($$ insert into public.onboarding_answers (workspace_id) values (%L) $$, :'wa'),
  '42501', null, 'onboarding_answers : insertion refusée');
select throws_ok(format($$ insert into public.contacts (workspace_id, name, phone) values (%L, 'X', '1') $$, :'wa'),
  '42501', null, 'contacts : insertion refusée');
select throws_ok(format($$ insert into public.pipeline_stages (workspace_id, name, position) values (%L, 'x', 9) $$, :'wa'),
  '42501', null, 'pipeline_stages : insertion refusée');
select throws_ok(format($$ insert into public.deals (workspace_id, contact_id, stage_id, title) values (%L, %L, %L, 'x') $$, :'wa', :'ca', :'sa'),
  '42501', null, 'deals : insertion refusée');
select throws_ok(format($$ insert into public.activities (workspace_id, contact_id) values (%L, %L) $$, :'wa', :'ca'),
  '42501', null, 'activities : insertion refusée');
select throws_ok(format($$ insert into public.reminders (workspace_id, title, due_at) values (%L, 'x', now()) $$, :'wa'),
  '42501', null, 'reminders : insertion refusée');
select throws_ok(format($$ insert into public.quotes (workspace_id, contact_id) values (%L, %L) $$, :'wa', :'ca'),
  '42501', null, 'quotes : insertion refusée');
select throws_ok(format($$ insert into public.invoices (workspace_id, contact_id) values (%L, %L) $$, :'wa', :'ca'),
  '42501', null, 'invoices : insertion refusée');
select throws_ok(format($$ insert into public.document_lines (workspace_id, quote_id, description, unit_price) values (%L, %L, 'x', 1) $$, :'wa', :'qa'),
  '42501', null, 'document_lines : insertion refusée');
select throws_ok(format($$ insert into public.number_sequences (workspace_id, doc_type, year) values (%L, 'invoice', 2030) $$, :'wa'),
  '42501', null, 'number_sequences : insertion refusée');
select throws_ok(format($$ insert into public.payment_accounts (workspace_id, provider) values (%L, 'manual') $$, :'wa'),
  '42501', null, 'payment_accounts : insertion refusée');
select throws_ok(format($$ insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference) values (%L, %L, %L, 'papi', 'IVN-x') $$, :'wa', :'ia', :'pa'),
  '42501', null, 'payment_links : insertion refusée');
select throws_ok(format($$ insert into public.payments (workspace_id, invoice_id, provider, method, amount, currency) values (%L, %L, 'manual', 'manual', 1, 'MGA') $$, :'wa', :'ia'),
  '42501', null, 'payments : insertion refusée');
select throws_ok(format($$ insert into public.workspace_members (workspace_id, user_id) values (%L, %L) $$, :'wa', :'bob'),
  '42501', null, 'workspace_members : insertion refusée');
select throws_ok($$ insert into public.workspaces (name) values ('x') $$,
  '42501', null, 'workspaces : insertion refusée');
select throws_ok(format($$ insert into public.profiles (user_id) values (%L) $$, :'alice'),
  '42501', null, 'profiles : insertion pour un autre utilisateur refusée');
select throws_ok($$ insert into public.webhook_events (provider, raw_body) values ('papi', '{}') $$,
  '42501', null, 'webhook_events : insertion refusée');

-- Mise à jour et suppression : sans effet sur les lignes d'Alice.
select * from tests.check_writes_isolated(:'wa');
select is(tests.affected(format($$ update public.workspaces set name = 'pirate' where id = %L $$, :'wa')),
  0, 'workspaces : mise à jour sans effet');
select is(tests.affected(format($$ update public.payment_accounts set manual_instructions = 'x' where workspace_id = %L $$, :'wa')),
  0, 'payment_accounts : mise à jour sans effet');
select is(tests.affected(format($$ delete from public.payment_accounts where workspace_id = %L $$, :'wa')),
  0, 'payment_accounts : suppression sans effet');
select is(tests.affected(format($$ update public.profiles set full_name = 'pirate' where user_id = %L $$, :'alice')),
  0, 'profiles : mise à jour d''un autre profil sans effet');
select is(tests.affected(format($$ delete from public.profiles where user_id = %L $$, :'alice')),
  0, 'profiles : suppression d''un autre profil sans effet');
select is(tests.affected($$ update public.profiles set full_name = 'Bob R.', phone = '+261340000001', locale = 'en' $$),
  1, 'profiles : Bob modifie son nom, son téléphone et sa langue');
select throws_ok($$ update public.profiles set created_at = now() - interval '1 year' $$,
  '42501', null, 'profiles : la date d''inscription (garantie 90 jours) n''est pas réécrite');
select throws_ok(format($$ update public.workspaces set plan = 'contrat_signe' where id = %L $$, :'wb'),
  '42501', null, 'workspaces : l''offre n''est pas modifiable par le navigateur');
select throws_ok(format($$ delete from public.contacts where workspace_id = %L $$, :'wa'),
  '42501', null, 'contacts : suppression refusée (archivage seulement)');
select throws_ok(format($$ delete from public.deals where workspace_id = %L $$, :'wa'),
  '42501', null, 'deals : suppression refusée (archivage seulement)');
select throws_ok(format($$ update public.payment_links set status = 'paid' where workspace_id = %L $$, :'wa'),
  '42501', null, 'payment_links : mise à jour refusée (serveur seulement)');
select throws_ok(format($$ delete from public.payment_links where workspace_id = %L $$, :'wa'),
  '42501', null, 'payment_links : suppression refusée (serveur seulement)');
select throws_ok(format($$ update public.number_sequences set last_value = 0 where workspace_id = %L $$, :'wa'),
  '42501', null, 'number_sequences : mise à jour refusée');
select throws_ok(format($$ delete from public.workspace_members where workspace_id = %L $$, :'wa'),
  '42501', null, 'workspace_members : suppression refusée');
select throws_ok(format($$ delete from public.workspaces where id = %L $$, :'wa'),
  '42501', null, 'workspaces : suppression refusée');

-- Déplacer sa propre ligne chez Alice, ou pointer vers un objet d'Alice : refusé.
insert into public.contacts (workspace_id, name, email) values (:'wb', 'Client Bob', 'c@example.test')
returning id as cb \gset
select throws_ok(format($$ update public.contacts set workspace_id = %L where id = %L $$, :'wa', :'cb'),
  '42501', null, 'impossible de déplacer une ligne vers un autre workspace');
select id as sb from public.pipeline_stages where position = 0 \gset
select throws_ok(format($$ insert into public.deals (workspace_id, contact_id, stage_id, title) values (%L, %L, %L, 'x') $$, :'wb', :'ca', :'sb'),
  '23503', null, 'clé étrangère composite : pas de lien vers le contact d''un autre workspace');

reset role;
select is((select count(*)::int from public.contacts where workspace_id = :'wa'), 1, 'les données d''Alice sont intactes');
select is((select name from public.workspaces where id = :'wa'), 'Studio Alice', 'le workspace d''Alice est intact');

-- Privilèges : TRUNCATE ignore la RLS ; ni les tables actuelles ni les futures ne le permettent.
select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
          or has_table_privilege('authenticated', c.oid, 'REFERENCES')
          or has_table_privilege('authenticated', c.oid, 'TRIGGER'))),
  null,
  'aucune table : TRUNCATE, REFERENCES ou TRIGGER pour authenticated'
);
create table public.tmp_default_privileges (id int);
select ok(
  not (has_table_privilege('authenticated', 'public.tmp_default_privileges', 'TRUNCATE')
       or has_table_privilege('authenticated', 'public.tmp_default_privileges', 'REFERENCES')
       or has_table_privilege('authenticated', 'public.tmp_default_privileges', 'TRIGGER')
       or has_table_privilege('anon', 'public.tmp_default_privileges', 'SELECT')),
  'nouvelle table : ni TRUNCATE, REFERENCES, TRIGGER pour authenticated, ni accès anon'
);
drop table public.tmp_default_privileges;

-- ---------------------------------------------------------------------------
-- anon : aucune table, aucune fonction interne.
-- ---------------------------------------------------------------------------
select tests.as_anon();
select * from tests.check_anon_blocked();
select throws_ok(format($$ select public.is_member(%L) $$, :'wa'), '42501', null, 'anon ne peut pas appeler is_member');
select throws_ok($$ select public.my_workspace_ids() $$, '42501', null, 'anon ne peut pas appeler my_workspace_ids');
select throws_ok($$ select public.quote_version(gen_random_uuid()) $$, '42501', null, 'anon ne peut pas appeler quote_version');
reset role;
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  array['accept_quote', 'get_public_invoice', 'get_public_quote', 'is_public_logo', 'public_document_exists'],
  'anon n''exécute que les 4 fonctions des pages publiques et le contrôle du logo public'
);

select * from finish();
rollback;
