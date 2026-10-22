-- Vérification fiscale (docs/spec-mvp.md, « Vérification fiscale ») :
--   1. Formats en base : NIF 10 chiffres, STAT 17 chiffres (null permis). La migration
--      échoue avec un message clair si une ligne existante ne les respecte pas.
--   2. Données fiscales complètes : corrigeables, jamais effacées (même règle que le serveur).
--   3. État de la vérification sur le workspace (non vérifié, en cours, vérifié, refusé),
--      modifiable seulement par le serveur et les admins ; remis à « non vérifié » quand le
--      NIF ou le STAT change.
--   4. Demandes et décisions (fiscal_verifications) : méthode, admin, date, motif ; jamais
--      les images (chemins effacés dès que les fichiers sont supprimés).
--   5. Admins de la plateforme (platform_admins), remplie à la main par le rôle serveur.
--   6. Plafond : tant que la carte n'est pas vérifiée, 3 factures émises au plus, contrôlé
--      sous le verrou du workspace (next_document_number), avant la limite Découverte.
--   7. Bucket privé « fiscal-documents » : un membre dépose dans son dossier, seulement
--      tant que la carte est à déposer (non vérifiée ou refusée) ; seul le serveur lit,
--      liste et supprime.
-- Codes d'erreur (55000, message-clé traduit dans errors.db.*) : fiscal_info_locked,
-- fiscal_verification_required, fiscal_already_verified, fiscal_already_pending,
-- fiscal_documents_missing, fiscal_request_not_pending, fiscal_reason_required.
-- Refus d'un non-admin : 42501 not_platform_admin.

-- ---------------------------------------------------------------------------
-- 1. Formats NIF et STAT
-- ---------------------------------------------------------------------------
do $$
declare
  bad integer;
begin
  select count(*) into bad
  from public.workspaces
  where (nif is not null and nif !~ '^[0-9]{10}$')
     or (stat is not null and stat !~ '^[0-9]{17}$');
  if bad > 0 then
    raise exception 'Migration vérification fiscale : % workspace(s) ont un NIF (10 chiffres) ou un STAT (17 chiffres) au mauvais format. Les corriger (ou les remettre à null) avant de relancer.', bad
      using errcode = '23514';
  end if;
end;
$$;

alter table public.workspaces
  add constraint workspaces_nif_format check (nif ~ '^[0-9]{10}$'),
  add constraint workspaces_stat_format check (stat ~ '^[0-9]{17}$');

-- ---------------------------------------------------------------------------
-- 3. État de la vérification (workspace)
-- ---------------------------------------------------------------------------
create type public.fiscal_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.fiscal_method as enum ('automatic', 'manual');

-- Workspaces existants : « non vérifié » (valeur par défaut).
-- fiscal_status_at : date du dernier changement d'état (vérifiée le…, refusée le…).
-- Absentes des colonnes modifiables par authenticated (droits par colonne) : seuls les
-- fonctions ci-dessous et le serveur les écrivent.
alter table public.workspaces
  add column fiscal_status public.fiscal_status not null default 'unverified',
  add column fiscal_status_at timestamptz,
  add column fiscal_rejection_reason text
    constraint workspaces_fiscal_rejection_reason_check check (char_length(fiscal_rejection_reason) <= 500);

-- ---------------------------------------------------------------------------
-- 4. Demandes de vérification et décisions
-- ---------------------------------------------------------------------------
-- nif, stat : numéros saisis au dépôt (la lecture automatique et l'admin comparent à eux).
-- front_path, back_path : photos dans « fiscal-documents », remises à null dès qu'elles
-- sont supprimées (décision prise, ou demande annulée puis nettoyée). status : pending (en
-- attente), verified, rejected, cancelled (NIF ou STAT changé pendant l'attente).
-- admins_notified_at : avis « demande à vérifier » envoyé aux admins (le rattrapage
-- quotidien prévient pour les demandes restées en attente sans avis).
create table public.fiscal_verifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  nif text not null,
  stat text not null,
  front_path text check (front_path is null or starts_with(front_path, workspace_id::text || '/')),
  back_path text check (back_path is null or starts_with(back_path, workspace_id::text || '/')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'cancelled')),
  method public.fiscal_method,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  rejection_reason text check (char_length(rejection_reason) <= 500),
  admins_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('verified', 'rejected')) = (method is not null and decided_at is not null)),
  check ((status = 'rejected') = (rejection_reason is not null))
);
-- Une seule demande en attente par workspace.
create unique index fiscal_verifications_one_pending on public.fiscal_verifications (workspace_id)
  where status = 'pending';
create index fiscal_verifications_decided_idx on public.fiscal_verifications (decided_at desc)
  where decided_at is not null;
create trigger t90_set_updated_at before update on public.fiscal_verifications
  for each row execute function public.set_updated_at();

-- Aucun accès direct depuis le navigateur : tout passe par les fonctions ci-dessous.
alter table public.fiscal_verifications enable row level security;
revoke all on public.fiscal_verifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admins de la plateforme
-- ---------------------------------------------------------------------------
-- Remplie à la main par le rôle serveur (SQL), jamais par l'application :
--   insert into public.platform_admins (user_id) select id from auth.users where email = '…';
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- E-mails des admins (avis « nouvelle demande à vérifier ») : serveur seulement.
create function public.platform_admin_emails()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.platform_admins a
  join auth.users u on u.id = a.user_id
  where u.email is not null;
$$;
revoke execute on function public.platform_admin_emails() from public, anon, authenticated;
grant execute on function public.platform_admin_emails() to service_role;

-- ---------------------------------------------------------------------------
-- 2 et 3. Données fiscales : jamais effacées une fois complètes ; NIF ou STAT changé :
-- vérification remise à zéro et demande en attente annulée (ses fichiers sont supprimés
-- par le serveur au passage suivant). Un changement d'état explicite dans la même requête
-- (rôle serveur) l'emporte ; authenticated ne peut pas écrire fiscal_status.
-- ---------------------------------------------------------------------------
create function public.workspaces_fiscal_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.nif is not null and old.stat is not null and old.tax_regime is not null
     and (new.nif is null or new.stat is null or new.tax_regime is null) then
    raise exception 'fiscal_info_locked' using errcode = '55000';
  end if;

  if (new.nif is distinct from old.nif or new.stat is distinct from old.stat)
     and new.fiscal_status is not distinct from old.fiscal_status
     and old.fiscal_status <> 'unverified' then
    new.fiscal_status := 'unverified';
    new.fiscal_status_at := null;
    new.fiscal_rejection_reason := null;
    update public.fiscal_verifications v
    set status = 'cancelled'
    where v.workspace_id = new.id and v.status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.workspaces_fiscal_guard() from public, anon, authenticated;

create trigger t15_fiscal_guard before update of nif, stat, tax_regime on public.workspaces
  for each row execute function public.workspaces_fiscal_guard();

-- ---------------------------------------------------------------------------
-- Dépôt : les deux photos sont déjà dans le dossier du workspace (envoi direct du
-- navigateur). Crée la demande et passe le workspace « en cours ». Serveur seulement (rôle
-- secret), par la route /api/fiscal/verification : elle a lu le workspace avec le client de
-- la personne connectée (RLS : membre seulement) et contrôlé le contenu réel des photos ;
-- elle lance ensuite la lecture automatique et prévient les admins.
-- ---------------------------------------------------------------------------
create function public.submit_fiscal_verification(p_workspace_id uuid, p_front_path text, p_back_path text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ws record;
  folder constant text := p_workspace_id::text || '/';
  request_id uuid;
begin
  select w.nif, w.stat, w.fiscal_status into ws
  from public.workspaces w
  where w.id = p_workspace_id
  for no key update;

  if not found then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if ws.nif is null or ws.stat is null then
    raise exception 'workspace_tax_info_missing' using errcode = '55000';
  end if;
  if ws.fiscal_status = 'verified' then
    raise exception 'fiscal_already_verified' using errcode = '55000';
  end if;
  if ws.fiscal_status = 'pending' then
    raise exception 'fiscal_already_pending' using errcode = '55000';
  end if;
  if p_front_path is null or p_back_path is null or p_front_path = p_back_path
     or not starts_with(p_front_path, folder) or not starts_with(p_back_path, folder)
     or (select count(*) from storage.objects o
         where o.bucket_id = 'fiscal-documents' and o.name in (p_front_path, p_back_path)) <> 2 then
    raise exception 'fiscal_documents_missing' using errcode = '55000';
  end if;

  insert into public.fiscal_verifications (workspace_id, nif, stat, front_path, back_path)
  values (p_workspace_id, ws.nif, ws.stat, p_front_path, p_back_path)
  returning id into request_id;

  update public.workspaces
  set fiscal_status = 'pending', fiscal_status_at = now(), fiscal_rejection_reason = null
  where id = p_workspace_id;
  return request_id;
end;
$$;
revoke execute on function public.submit_fiscal_verification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.submit_fiscal_verification(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Décision (lecture automatique concordante, ou admin). Renvoie les chemins des photos à
-- supprimer (effacés de la demande) et de quoi prévenir la freelance. Serveur seulement :
-- les admins passent par admin_decide_fiscal_verification.
-- ---------------------------------------------------------------------------
create function public.decide_fiscal_verification(
  p_request_id uuid,
  p_verified boolean,
  p_method public.fiscal_method,
  p_reason text default null,
  p_admin uuid default null
)
returns table (
  workspace_id uuid,
  workspace_name text,
  owner_email text,
  owner_locale text,
  front_path text,
  back_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  req record;
  ws_id uuid;
  reason text := nullif(btrim(p_reason), '');
begin
  -- Verrous dans le même ordre que partout ailleurs (next_document_number,
  -- submit_fiscal_verification, changement de NIF ou de STAT puis t15_fiscal_guard) :
  -- d'abord le workspace, puis la demande. L'ordre inverse se bloquait mutuellement avec
  -- un changement de NIF simultané (interblocage, une des deux transactions annulée).
  select v.workspace_id into ws_id from public.fiscal_verifications v where v.id = p_request_id;
  if ws_id is not null then
    perform 1 from public.workspaces w where w.id = ws_id for no key update;
  end if;
  select v.* into req
  from public.fiscal_verifications v
  where v.id = p_request_id
  for update;
  if not found or req.status <> 'pending' then
    raise exception 'fiscal_request_not_pending' using errcode = '55000';
  end if;
  if not p_verified and reason is null then
    raise exception 'fiscal_reason_required' using errcode = '55000';
  end if;
  if char_length(reason) > 500 then
    raise exception 'fiscal_reason_required' using errcode = '55000';
  end if;

  update public.fiscal_verifications v
  set status = case when p_verified then 'verified' else 'rejected' end,
      method = p_method,
      decided_by = p_admin,
      decided_at = now(),
      rejection_reason = case when p_verified then null else reason end,
      front_path = null,
      back_path = null
  where v.id = p_request_id;

  update public.workspaces w
  set fiscal_status = case when p_verified then 'verified'::public.fiscal_status else 'rejected'::public.fiscal_status end,
      fiscal_status_at = now(),
      fiscal_rejection_reason = case when p_verified then null else reason end
  where w.id = req.workspace_id;

  return query
  select w.id, w.name, u.email::text, p.locale::text, req.front_path, req.back_path
  from public.workspaces w
  left join public.workspace_members m on m.workspace_id = w.id and m.role = 'owner'
  left join auth.users u on u.id = m.user_id
  left join public.profiles p on p.user_id = m.user_id
  where w.id = req.workspace_id
  limit 1;
end;
$$;
revoke execute on function public.decide_fiscal_verification(uuid, boolean, public.fiscal_method, text, uuid)
  from public, anon, authenticated;
grant execute on function public.decide_fiscal_verification(uuid, boolean, public.fiscal_method, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Fonctions des admins (contrôle en base : un non-admin reçoit 42501).
-- ---------------------------------------------------------------------------
create function public.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.require_platform_admin() from public, anon, authenticated;

create function public.admin_decide_fiscal_verification(p_request_id uuid, p_verified boolean, p_reason text default null)
returns table (
  workspace_id uuid,
  workspace_name text,
  owner_email text,
  owner_locale text,
  front_path text,
  back_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_platform_admin();
  return query
  select * from public.decide_fiscal_verification(p_request_id, p_verified, 'manual', p_reason, (select auth.uid()));
end;
$$;
revoke execute on function public.admin_decide_fiscal_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_decide_fiscal_verification(uuid, boolean, text) to authenticated;

-- File d'attente : demandes en attente, les plus anciennes d'abord.
create function public.admin_fiscal_queue()
returns table (
  id uuid,
  workspace_id uuid,
  workspace_name text,
  nif text,
  stat text,
  created_at timestamptz,
  front_path text,
  back_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_platform_admin();
  return query
  select v.id, v.workspace_id, w.name, v.nif, v.stat, v.created_at, v.front_path, v.back_path
  from public.fiscal_verifications v
  join public.workspaces w on w.id = v.workspace_id
  where v.status = 'pending'
  order by v.created_at;
end;
$$;
revoke execute on function public.admin_fiscal_queue() from public, anon;
grant execute on function public.admin_fiscal_queue() to authenticated;

-- Dernières décisions (sans images).
create function public.admin_fiscal_history(p_limit integer default 20)
returns table (
  id uuid,
  workspace_name text,
  status text,
  method public.fiscal_method,
  decided_at timestamptz,
  decided_by_email text,
  rejection_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_platform_admin();
  return query
  select v.id, w.name, v.status, v.method, v.decided_at, u.email::text, v.rejection_reason
  from public.fiscal_verifications v
  join public.workspaces w on w.id = v.workspace_id
  left join auth.users u on u.id = v.decided_by
  where v.status in ('verified', 'rejected')
  order by v.decided_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;
revoke execute on function public.admin_fiscal_history(integer) from public, anon;
grant execute on function public.admin_fiscal_history(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Plafond de 3 factures tant que la carte n'est pas vérifiée, puis limite Découverte.
-- Même verrou sur la ligne du workspace : deux émissions simultanées ne passent jamais à 4.
-- Les factures déjà émises (sent_at posé, annulées comprises) comptent.
-- ---------------------------------------------------------------------------
create or replace function public.next_document_number(p_workspace_id uuid, p_doc_type public.doc_type)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Indian/Antananarivo')::date;
  y integer := extract(year from today)::integer;
  month_start constant timestamptz :=
    date_trunc('month', today)::timestamp at time zone 'Indian/Antananarivo';
  free_documents constant integer := 3; -- même valeur que les constantes de canUse
  unverified_invoices constant integer := 3; -- même valeur que UNVERIFIED_INVOICE_LIMIT
  ws_plan public.plan;
  ws_fiscal public.fiscal_status;
  v integer;
begin
  -- Verrou d'abord sur le workspace, puis sur la séquence : toujours dans cet ordre.
  select w.plan, w.fiscal_status into ws_plan, ws_fiscal
  from public.workspaces w where w.id = p_workspace_id for no key update;

  if p_doc_type = 'invoice' and ws_fiscal <> 'verified' and (
    select count(*) from public.invoices i where i.workspace_id = p_workspace_id and i.sent_at is not null
  ) >= unverified_invoices then
    raise exception 'fiscal_verification_required' using errcode = '55000';
  end if;

  if ws_plan = 'decouverte' and (
    (select count(*) from public.quotes q where q.workspace_id = p_workspace_id and q.sent_at >= month_start)
    + (select count(*) from public.invoices i where i.workspace_id = p_workspace_id and i.sent_at >= month_start)
  ) >= free_documents then
    raise exception 'free_limit_reached' using errcode = '55000';
  end if;

  insert into public.number_sequences (workspace_id, doc_type, year)
  values (p_workspace_id, p_doc_type, y)
  on conflict (workspace_id, doc_type, year) do nothing;

  select s.last_value into v
  from public.number_sequences s
  where s.workspace_id = p_workspace_id and s.doc_type = p_doc_type and s.year = y
  for update;

  v := v + 1;

  update public.number_sequences s
  set last_value = v
  where s.workspace_id = p_workspace_id and s.doc_type = p_doc_type and s.year = y;

  return case p_doc_type when 'quote' then 'D-' else 'F-' end
    || y::text || '-'
    || case when v < 10000 then lpad(v::text, 4, '0') else v::text end;
end;
$$;
revoke execute on function public.next_document_number(uuid, public.doc_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Photos de la carte fiscale : bucket privé, 10 Mo, JPG / PNG / WEBP.
-- Un membre dépose dans le dossier de son workspace, seulement quand la carte est à
-- déposer (non vérifiée ou refusée : rien après la vérification ni pendant l'attente) ;
-- aucune politique de lecture, de mise à jour ni de suppression : seul le serveur (clé
-- secrète) lit, liste et supprime. Dépôts jamais soumis : supprimés par le serveur au
-- dépôt suivant et par le rattrapage quotidien.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiscal-documents', 'fiscal-documents', false, 10 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Workspaces de la personne connectée dont la carte est à déposer.
create function public.fiscal_upload_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.workspaces w
  where w.id in (select public.my_workspace_ids())
    and w.fiscal_status in ('unverified', 'rejected');
$$;
revoke execute on function public.fiscal_upload_workspace_ids() from public, anon;
grant execute on function public.fiscal_upload_workspace_ids() to authenticated;

-- Chemin exact <workspace>/<uuid>.<jpg|png|webp> (même format que fiscalFilePath) : aucun
-- sous-dossier, que le nettoyage (liste du seul premier niveau) ne verrait jamais.
create policy "fiscal_documents_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fiscal-documents'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and (storage.foldername(name))[1] in (select w::text from public.fiscal_upload_workspace_ids() w)
  );
