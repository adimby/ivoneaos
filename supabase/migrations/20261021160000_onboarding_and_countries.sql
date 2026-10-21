-- Retours d'Ivonea (21 octobre 2026) :
-- 1. NIF, STAT et régime fiscal ne sont plus demandés à l'accueil guidé, seulement avant
--    la première facture (la base refuse déjà d'émettre une facture sans eux). L'accès à
--    l'application dépend désormais de onboarded_at ; profile_completed_at garde son sens
--    d'indicateur de la garantie 90 jours (profil complet, données fiscales comprises).
-- 2. Pays des contacts : les pays les plus utilisés par le workspace, proposés en tête.
-- Migration rejouable et sans suppression : ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- workspaces.onboarded_at
-- ---------------------------------------------------------------------------
-- Accueil guidé terminé : posé par la base (trigger) la première fois que nom, métier et
-- adresse sont remplis (la devise a toujours une valeur) ; jamais saisi, jamais effacé.
-- Comme profile_completed_at, absent des colonnes modifiables par authenticated.
alter table public.workspaces add column if not exists onboarded_at timestamptz;

-- Rattrapage : workspaces qui ont terminé l'ancien accueil guidé. Il exigeait le profil
-- complet, donc exactement ceux dont profile_completed_at est posé : même date. Les autres
-- (accueil guidé jamais terminé) restent à null et le terminent normalement ; le trigger
-- ci-dessous pose alors la date.
-- Effet de bord assumé : t90_set_updated_at avance updated_at des lignes rattrapées
-- (colonne lue par aucune requête de l'application).
-- Rejouable : à la première exécution le trigger n'existe pas encore ; une exécution
-- suivante ne retrouve que des lignes sans adresse (le trigger leur aurait sinon posé la
-- date), pour lesquelles le trigger garde onboarded_at à null : aucun changement.
update public.workspaces
set onboarded_at = profile_completed_at
where onboarded_at is null
  and profile_completed_at is not null;

create or replace function public.workspaces_onboarding_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.onboarded_at := case when tg_op = 'UPDATE' then old.onboarded_at end;
  if new.onboarded_at is null
     and nullif(btrim(new.name), '') is not null
     and nullif(btrim(new.trade), '') is not null
     and nullif(btrim(new.address), '') is not null then
    new.onboarded_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.workspaces_onboarding_completion() from public, anon, authenticated;

create or replace trigger t21_onboarding_completion before insert or update on public.workspaces
  for each row execute function public.workspaces_onboarding_completion();

comment on column public.workspaces.onboarded_at is
  'Accueil guidé terminé (nom, métier, adresse) : ouvre l''application. Posé par la base, jamais effacé.';
comment on column public.workspaces.profile_completed_at is
  'Garantie 90 jours : profil complet (nom, métier, NIF, STAT, régime fiscal). Posé par la base, jamais effacé.';

-- ---------------------------------------------------------------------------
-- Pays favoris des contacts
-- ---------------------------------------------------------------------------
-- Les 5 pays (hors Madagascar, toujours proposé en premier) qui comptent le plus de
-- contacts actifs. SECURITY INVOKER : la RLS des contacts s'applique.
create or replace function public.contact_top_countries(p_workspace_id uuid)
returns table (country text, contacts integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.country, count(*)::integer as contacts
  from public.contacts c
  where c.workspace_id = p_workspace_id
    and c.archived_at is null
    and c.country <> 'MG'
  group by c.country
  order by count(*) desc, c.country
  limit 5;
$$;
revoke execute on function public.contact_top_countries(uuid) from public, anon;
grant execute on function public.contact_top_countries(uuid) to authenticated;
