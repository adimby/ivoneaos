-- Étape 8 : limites de débit de la connexion (service role seulement).
begin;
\ir helpers.psql
select plan(10);

select ok(not has_function_privilege('anon', 'public.auth_rate_limit(text, integer, integer)', 'execute'),
  'anon : auth_rate_limit refusée');
select ok(not has_function_privilege('authenticated', 'public.auth_rate_limit(text, integer, integer)', 'execute'),
  'authenticated : auth_rate_limit refusée');
select ok(has_function_privilege('service_role', 'public.auth_rate_limit(text, integer, integer)', 'execute'),
  'service_role : auth_rate_limit permise');
select ok(not has_table_privilege('anon', 'public.auth_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.auth_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.auth_attempts', 'insert'),
  'auth_attempts : aucun droit pour anon et authenticated');

set local role service_role;
select is(public.auth_rate_limit('t:a', 2, 60), true, '1re tentative acceptée');
select is(public.auth_rate_limit('t:a', 2, 60), true, '2e tentative acceptée');
select is(public.auth_rate_limit('t:a', 2, 60), false, '3e tentative refusée (limite 2)');
select is((select count(*)::integer from public.auth_attempts where key = 't:a'), 2,
  'une tentative refusée n''est pas enregistrée');
select is(public.auth_rate_limit('t:b', 2, 60), true, 'autre clé : compteur séparé');

-- Fenêtre glissante : les tentatives anciennes ne comptent plus.
update public.auth_attempts set at = now() - interval '2 minutes' where key = 't:a';
select is(public.auth_rate_limit('t:a', 2, 60), true, 'fenêtre passée : tentative acceptée');

select * from finish();
rollback;
