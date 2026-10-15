-- CRM (parcours P3, P4) : notification des rappels par le cron quotidien et recherche
-- des contacts.

-- ---------------------------------------------------------------------------
-- 1. Rappels : réservation par bail, nombre d'essais.
-- ---------------------------------------------------------------------------
-- Le cron réserve un lot (notify_claimed_at), envoie, puis pose notified_at seulement
-- après un envoi réussi. Un passage interrompu (délai dépassé, plantage) laisse un bail
-- qui expire : les rappels sont repris au passage suivant au lieu d'être perdus.
-- notify_attempts compte les échecs : au-delà de 3, un rappel impossible à envoyer
-- (aucun destinataire, adresse refusée) ne bloque plus la file des autres.
alter table public.reminders
  add column notify_claimed_at timestamptz,
  add column notify_attempts smallint not null default 0;

-- Colonnes du cron : jamais modifiées par la personne connectée.
revoke update on public.reminders from authenticated;
grant update (contact_id, deal_id, title, due_at, done_at, notified_at, updated_at)
  on public.reminders to authenticated;

-- Rappel reprogrammé (repoussé, nouvelle date) : de nouveau à notifier le jour venu.
create function public.reminders_reschedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.due_at is distinct from old.due_at then
    new.notified_at := null;
    new.notify_claimed_at := null;
    new.notify_attempts := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.reminders_reschedule() from public, anon, authenticated;

create trigger reminders_reschedule
  before update of due_at on public.reminders
  for each row execute function public.reminders_reschedule();

-- Réserve au plus p_limit rappels dus avant p_cutoff, non faits, pas encore notifiés,
-- sans bail en cours, dont le contact et l'opportunité ne sont pas archivés.
-- Une seule requête (identifiants jamais dans l'URL) ; deux passages simultanés ne
-- prennent jamais le même rappel (skip locked + bail).
create function public.claim_due_reminders(
  p_cutoff timestamptz,
  p_limit integer default 100,
  p_lease interval default interval '15 minutes'
)
returns table (
  id uuid,
  workspace_id uuid,
  title text,
  due_at timestamptz,
  contact_name text,
  deal_title text,
  claimed_at timestamptz
)
language sql
set search_path = ''
as $$
  with picked as (
    select r.id
    from public.reminders r
    left join public.contacts c on c.workspace_id = r.workspace_id and c.id = r.contact_id
    left join public.deals d on d.workspace_id = r.workspace_id and d.id = r.deal_id
    where r.done_at is null
      and r.notified_at is null
      and r.due_at < p_cutoff
      and (r.notify_claimed_at is null or r.notify_claimed_at < now() - p_lease)
      and r.notify_attempts < 3
      and c.archived_at is null
      and d.archived_at is null
    order by r.due_at, r.id
    limit least(greatest(p_limit, 1), 500)
    for update of r skip locked
  ),
  claimed as (
    update public.reminders r
    set notify_claimed_at = now()
    from picked
    where r.id = picked.id
    returning r.id, r.workspace_id, r.title, r.due_at, r.contact_id, r.deal_id, r.notify_claimed_at
  )
  select cl.id, cl.workspace_id, cl.title, cl.due_at, c.name, d.title, cl.notify_claimed_at
  from claimed cl
  left join public.contacts c on c.workspace_id = cl.workspace_id and c.id = cl.contact_id
  left join public.deals d on d.workspace_id = cl.workspace_id and d.id = cl.deal_id
  order by cl.due_at, cl.id;
$$;

-- mark et release ne touchent que les rappels encore réservés par ce passage
-- (notify_claimed_at = p_claimed_at, valeur renvoyée par claim_due_reminders) : un rappel
-- repoussé pendant l'envoi (bail levé par reminders_reschedule) ou repris par un autre
-- passage après expiration du bail n'est pas modifié.

-- Envoi réussi : notifiés pour de bon, bail levé. Renvoie le nombre de rappels marqués.
create function public.mark_reminders_notified(p_ids uuid[], p_claimed_at timestamptz)
returns integer
language sql
set search_path = ''
as $$
  with done as (
    update public.reminders
    set notified_at = now(), notify_claimed_at = null
    where id = any (p_ids) and notified_at is null and notify_claimed_at = p_claimed_at
    returning 1
  )
  select count(*)::integer from done;
$$;

-- Non envoyés : bail levé, repris au prochain passage. p_failed compte un essai
-- (échec d'envoi, personne à prévenir) ; un envoi désactivé (pas de clé) ne compte pas.
-- Renvoie les rappels qui atteignent 3 essais : plus repris par le cron (ils restent dans
-- « Aujourd'hui »), à journaliser par l'appelant.
create function public.release_reminders(p_ids uuid[], p_claimed_at timestamptz, p_failed boolean)
returns setof uuid
language sql
set search_path = ''
as $$
  with released as (
    update public.reminders
    set notify_claimed_at = null,
        notify_attempts = notify_attempts + (case when p_failed then 1 else 0 end)
    where id = any (p_ids) and notified_at is null and notify_claimed_at = p_claimed_at
    returning id, notify_attempts
  )
  select id from released where p_failed and notify_attempts >= 3;
$$;

revoke execute on function public.claim_due_reminders(timestamptz, integer, interval) from public, anon, authenticated;
revoke execute on function public.mark_reminders_notified(uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.release_reminders(uuid[], timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz, integer, interval) to service_role;
grant execute on function public.mark_reminders_notified(uuid[], timestamptz) to service_role;
grant execute on function public.release_reminders(uuid[], timestamptz, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Recherche des contacts : nom, entreprise, e-mail et étiquettes.
-- ---------------------------------------------------------------------------
-- Champ calculé PostgREST (filtre « search_text.ilike… ») : droits de l'appelant, RLS
-- appliquée.
create function public.search_text(public.contacts)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(' ', $1.name, $1.company_name, $1.email, array_to_string($1.tags, ' '));
$$;
revoke execute on function public.search_text(public.contacts) from public, anon;
grant execute on function public.search_text(public.contacts) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rappels d'un contact ou d'une opportunité archivés : hors « Aujourd'hui ».
-- ---------------------------------------------------------------------------
-- Champ calculé PostgREST (filtre « about_active=is.true ») : faux si le contact ou
-- l'opportunité du rappel est archivé. Droits de l'appelant, RLS appliquée. Le cron
-- applique la même règle dans claim_due_reminders.
create function public.about_active(public.reminders)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
      select 1 from public.contacts c
      where c.workspace_id = $1.workspace_id and c.id = $1.contact_id and c.archived_at is not null
    )
    and not exists (
      select 1 from public.deals d
      where d.workspace_id = $1.workspace_id and d.id = $1.deal_id and d.archived_at is not null
    );
$$;
revoke execute on function public.about_active(public.reminders) from public, anon;
grant execute on function public.about_active(public.reminders) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Pipeline : nombre et total par étape, calculés sur toutes les opportunités.
-- ---------------------------------------------------------------------------
-- La liste du pipeline est limitée ; les compteurs et totaux par étape restent justes
-- au-delà. Mêmes règles que la liste : opportunité et contact non archivés. Par devise,
-- jamais de conversion. Droits de l'appelant, RLS appliquée.
create function public.pipeline_totals(p_workspace_id uuid)
returns table (stage_id uuid, currency public.currency, deal_count integer, amount_sum bigint)
language sql
stable
set search_path = ''
as $$
  select d.stage_id, d.currency, count(*)::integer, sum(d.amount)::bigint
  from public.deals d
  join public.contacts c on c.workspace_id = d.workspace_id and c.id = d.contact_id
  where d.workspace_id = p_workspace_id
    and d.archived_at is null
    and c.archived_at is null
  group by d.stage_id, d.currency;
$$;
revoke execute on function public.pipeline_totals(uuid) from public, anon;
grant execute on function public.pipeline_totals(uuid) to authenticated;
