-- create_workspace, profil créé à l'inscription, membre propriétaire, 6 étapes.
begin;
\ir helpers.psql
select plan(27);

select tests.create_user('alice@example.test', '{"full_name": "Alice R.", "locale": "en"}') as alice \gset
select tests.create_user('bob@example.test') as bob \gset

select is(
  (select row(full_name, locale::text) from public.profiles where user_id = :'alice'),
  row('Alice R.'::text, 'en'::text),
  'le profil est créé à l''inscription avec le nom et la langue'
);
select is(
  (select locale::text from public.profiles where user_id = :'bob'),
  'fr',
  'langue par défaut : français'
);

-- Sans session, pas de workspace.
select tests.as_anon();
select throws_ok(
  $$ select public.create_workspace('Anonyme') $$,
  '42501', null,
  'anon ne peut pas appeler create_workspace'
);
reset role;

select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice', 'MGA', 'Graphiste') as ws \gset

select is(
  (select row(name, trade, default_currency::text, level::text) from public.workspaces where id = :'ws'),
  row('Studio Alice'::text, 'Graphiste'::text, 'MGA'::text, 'lancer'::text),
  'le workspace est créé avec ses valeurs'
);
select is(
  (select role::text from public.workspace_members where workspace_id = :'ws' and user_id = :'alice'),
  'owner',
  'la créatrice est propriétaire'
);
select is(
  (select count(*)::int from public.pipeline_stages where workspace_id = :'ws'),
  6,
  '6 étapes de pipeline sont créées'
);
select results_eq(
  $$ select name, position, kind::text from public.pipeline_stages order by position $$,
  $$ values ('prospect'::text, 0, 'open'::text), ('contacted', 1, 'open'), ('call', 2, 'open'),
            ('quote', 3, 'open'), ('won', 4, 'won'), ('lost', 5, 'lost') $$,
  'étapes : clés traduisibles, ordre et nature'
);
select is(
  public.create_workspace('Autre nom'),
  :'ws'::uuid,
  'un second appel renvoie le même workspace (idempotent)'
);
select is(
  (select count(*)::int from public.workspaces),
  1,
  'aucun workspace en double'
);
select ok(public.is_member(:'ws'), 'is_member vrai pour un membre');
select results_eq($$ select * from public.my_workspace_ids() $$, array[:'ws'::uuid],
  'my_workspace_ids : les workspaces de l''utilisateur');

-- Indicateur « profil terminé » (garantie 90 jours) : posé par la base, une seule fois.
select is((select profile_completed_at from public.workspaces where id = :'ws'), null,
  'profil incomplet : pas de date');
select throws_ok(format($$ update public.workspaces set profile_completed_at = now() where id = %L $$, :'ws'),
  '42501', null, 'profile_completed_at ne se saisit pas');
update public.workspaces set nif = '1234567890', stat = '12345 11 2026 0 00001' where id = :'ws';
select is((select profile_completed_at from public.workspaces where id = :'ws'), null,
  'sans régime fiscal : toujours pas de date');
update public.workspaces set tax_regime = 'tva', trade = '  ' where id = :'ws';
select is((select profile_completed_at from public.workspaces where id = :'ws'), null,
  'métier vide : toujours pas de date');
update public.workspaces set trade = 'Graphiste' where id = :'ws';
select isnt((select profile_completed_at from public.workspaces where id = :'ws'), null,
  'nom, métier, NIF, STAT et régime remplis : date posée');
select profile_completed_at as completed from public.workspaces where id = :'ws' \gset
update public.workspaces set nif = null where id = :'ws';
select is((select profile_completed_at from public.workspaces where id = :'ws'), :'completed'::timestamptz,
  'la date n''est jamais effacée ni déplacée');
reset role;
update public.workspaces set profile_completed_at = null where id = :'ws';
select is((select profile_completed_at from public.workspaces where id = :'ws'), :'completed'::timestamptz,
  'même le serveur ne la modifie pas');
select tests.authenticate_as(:'alice');

-- Étapes « gagné » et « perdu » : fixes (le tableau de bord et le passage à « gagné » en dépendent).
select is(tests.affected($$ delete from public.pipeline_stages where kind = 'won' $$), 0,
  'l''étape gagné ne se supprime pas');
select throws_ok($$ update public.pipeline_stages set kind = 'open' where kind = 'lost' $$,
  '42501', null, 'la nature d''une étape ne se modifie pas');
select throws_ok(format($$ insert into public.pipeline_stages (workspace_id, name, position, kind) values (%L, 'won2', 9, 'won') $$, :'ws'),
  '42501', null, 'pas de seconde étape gagné');
select lives_ok($$ update public.pipeline_stages set name = 'Gagné !' where kind = 'won' $$,
  'une étape gagné se renomme');
select is(tests.affected($$ delete from public.pipeline_stages where name = 'call' $$), 1,
  'une étape ouverte se supprime');

-- Écritures directes interdites : passer par create_workspace.
select throws_ok(
  $$ insert into public.workspaces (name) values ('Direct') $$,
  '42501', null,
  'insertion directe d''un workspace refusée'
);
select throws_ok(
  format($$ insert into public.workspace_members (workspace_id, user_id, role) values (%L, %L, 'owner') $$, :'ws', :'bob'),
  '42501', null,
  'impossible d''ajouter un membre depuis le navigateur'
);

select tests.authenticate_as(:'bob');
select ok(not public.is_member(:'ws'), 'is_member faux pour un non-membre');
select throws_ok(
  $$ select public.create_workspace('   ') $$,
  '23514', null,
  'un nom vide est refusé'
);

select * from finish();
rollback;
