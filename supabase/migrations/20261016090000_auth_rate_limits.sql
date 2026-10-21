-- Étape 8 : limites de débit de la connexion par code (envoi, renvoi, vérification).
-- signInWithOtp et verifyOtp partent du serveur Next : Supabase compte toutes les demandes
-- sur les IP de sortie de Vercel, ses limites sont donc communes à toutes les utilisatrices.
-- L'application compte elle-même par IP client et par adresse e-mail (src/modules/auth).
-- Fenêtre glissante : une ligne par tentative acceptée, jamais plus de p_max lignes par clé.

create table public.auth_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index auth_attempts_key_at on public.auth_attempts (key, at);
create index auth_attempts_at on public.auth_attempts (at);

-- Service role seulement (client secret des actions serveur) : aucune politique, aucun droit.
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from public, anon, authenticated;
grant select, insert, delete on public.auth_attempts to service_role;

-- true : tentative acceptée (et comptée) ; false : limite atteinte pour cette clé.
create function public.auth_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if p_key is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;
  -- Deux demandes simultanées pour la même clé ne dépassent pas la limite ensemble.
  perform pg_advisory_xact_lock(hashtext('auth_rate_limit:' || p_key));
  -- Ménage : rien n'est gardé plus d'une journée (fenêtres de quelques minutes).
  delete from public.auth_attempts where at < now() - interval '1 day';
  select count(*) into recent
  from public.auth_attempts
  where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if recent >= p_max then
    return false;
  end if;
  insert into public.auth_attempts (key) values (p_key);
  return true;
end;
$$;

revoke execute on function public.auth_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.auth_rate_limit(text, integer, integer) to service_role;
