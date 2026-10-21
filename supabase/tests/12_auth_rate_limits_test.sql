-- Étape 8 : limites de débit de la connexion (service role seulement).
begin;
\ir helpers.psql
select plan(18);

select ok(not has_function_privilege('anon', 'public.auth_rate_limit(text, integer, integer)', 'execute'),
  'anon : auth_rate_limit refusée');
select ok(not has_function_privilege('authenticated', 'public.auth_rate_limit(text, integer, integer)', 'execute'),
  'authenticated : auth_rate_limit refusée');
select ok(has_function_privilege('service_role', 'public.auth_rate_limit(text, integer, integer)', 'execute'),
  'service_role : auth_rate_limit permise');
select ok(not has_function_privilege('anon', 'public.auth_rate_limit_release(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.auth_rate_limit_release(text)', 'execute'),
  'anon et authenticated : auth_rate_limit_release refusée');
select ok(has_function_privilege('service_role', 'public.auth_rate_limit_release(text)', 'execute'),
  'service_role : auth_rate_limit_release permise');
select ok(not has_table_privilege('anon', 'public.auth_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.auth_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.auth_attempts', 'insert'),
  'auth_attempts : aucun droit pour anon et authenticated');

set local role service_role;
-- Clés : empreintes hexadécimales de 64 caractères (src/modules/auth/attempt-key.ts).
select is(public.auth_rate_limit(repeat('a', 64), 2, 60), true, '1re tentative acceptée');
select is(public.auth_rate_limit(repeat('a', 64), 2, 60), true, '2e tentative acceptée');
select is(public.auth_rate_limit(repeat('a', 64), 2, 60), false, '3e tentative refusée (limite 2)');
select is((select count(*)::integer from public.auth_attempts where key = repeat('a', 64)), 2,
  'une tentative refusée n''est pas enregistrée');
select is(public.auth_rate_limit(repeat('b', 64), 2, 60), true, 'autre clé : compteur séparé');

-- Essai rendu : une seule ligne retirée, de cette clé, et une place se libère.
select lives_ok($$ select public.auth_rate_limit_release(repeat('a', 64)) $$, 'essai rendu');
select is((select count(*)::integer from public.auth_attempts where key = repeat('a', 64)), 1,
  'une seule ligne retirée');
select is((select count(*)::integer from public.auth_attempts where key = repeat('b', 64)), 1,
  'les autres clés ne bougent pas');
select is(public.auth_rate_limit(repeat('a', 64), 2, 60), true, 'place libérée : tentative acceptée');
select lives_ok($$ select public.auth_rate_limit_release(repeat('c', 64)) $$,
  'rendre un essai d''une clé inconnue ne fait rien');

-- Pas de donnée personnelle en clair : une adresse e-mail ou une IP est refusée.
select throws_ok($$ select public.auth_rate_limit('send:email:a@example.test', 2, 60) $$, '23514',
  null, 'clé en clair refusée');

-- Fenêtre glissante : les tentatives anciennes ne comptent plus.
update public.auth_attempts set at = now() - interval '2 minutes' where key = repeat('a', 64);
select is(public.auth_rate_limit(repeat('a', 64), 2, 60), true, 'fenêtre passée : tentative acceptée');

select * from finish();
rollback;
