-- Étape 8 (revue) : compteurs de connexion sans donnée personnelle en clair, et essais
-- rendus quand Supabase refuse l'envoi du code.
-- La clé est une empreinte HMAC-SHA256 calculée par l'application (src/modules/auth/
-- attempt-key.ts) : ni adresse e-mail ni IP dans la base.

-- Anciennes lignes (clés en clair) : fenêtres de quelques minutes, rien à garder.
delete from public.auth_attempts;
alter table public.auth_attempts
  add constraint auth_attempts_key_hashed check (key ~ '^[0-9a-f]{64}$');

-- Rend le dernier essai compté pour cette clé (envoi refusé par Supabase : aucun code parti).
create function public.auth_rate_limit_release(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.auth_attempts
  where ctid = (
    select ctid from public.auth_attempts
    where key = p_key
    order by at desc
    limit 1
  );
$$;

revoke execute on function public.auth_rate_limit_release(text) from public, anon, authenticated;
grant execute on function public.auth_rate_limit_release(text) to service_role;
