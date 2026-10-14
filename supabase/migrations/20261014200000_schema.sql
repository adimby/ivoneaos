-- Ivonea OS : modèle de données du MVP (docs/spec-mvp.md, « Modèle de données »).
-- Tout appartient à un workspace. Montants en bigint (unité mineure : ariary, centimes).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.locale as enum ('fr', 'en');
create type public.currency as enum ('MGA', 'EUR', 'USD');
create type public.workspace_level as enum ('lancer', 'remplir', 'grandir');
-- Offre (spec « Offres et limites ») : changée à la main par le serveur, jamais par l'utilisatrice.
create type public.plan as enum ('decouverte', 'lancement', 'premier_client', 'contrat_signe');
create type public.tax_regime as enum ('tva', 'impot_synthetique');
create type public.member_role as enum ('owner', 'member');
create type public.contact_kind as enum ('person', 'company');
create type public.stage_kind as enum ('open', 'won', 'lost');
create type public.activity_kind as enum ('note', 'call', 'whatsapp', 'email', 'meeting');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'cancelled');
create type public.doc_type as enum ('quote', 'invoice');
create type public.payment_provider as enum ('papi', 'whop', 'manual');
create type public.payment_account_status as enum ('pending', 'connected', 'error', 'disabled');
create type public.payment_link_status as enum ('active', 'paid', 'expired', 'failed', 'cancelled');
create type public.payment_method as enum ('MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY', 'CARD', 'manual');

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Horloge réelle (pas l'heure de début de transaction) : deux écritures d'une même
  -- transaction ont des updated_at distincts et ordonnés.
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- Jeton public de 32 caractères URL-safe (24 octets aléatoires en base64url).
create function public.generate_public_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 200),
  phone text check (char_length(phone) <= 40),
  locale public.locale not null default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  trade text check (char_length(trade) <= 200),
  level public.workspace_level not null default 'lancer',
  default_currency public.currency not null default 'MGA',
  nif text check (char_length(nif) <= 50),
  stat text check (char_length(stat) <= 50),
  tax_regime public.tax_regime,
  address text check (char_length(address) <= 500),
  -- Le logo vit dans le dossier du workspace (bucket « logos ») : jamais ailleurs.
  logo_path text check (logo_path is null or starts_with(logo_path, id::text || '/')),
  invoice_footer text check (char_length(invoice_footer) <= 1000),
  -- Découverte (gratuit) : 20 contacts actifs, 3 devis + factures envoyés par mois
  -- (contrôlés par contacts_plan_limit et next_document_number). Les autres offres : illimité.
  -- Modifiable par le serveur seulement (pas de privilège UPDATE pour authenticated).
  plan public.plan not null default 'decouverte',
  -- Indicateur de la garantie 90 jours : posé par la base (trigger) la première fois que
  -- nom, métier, NIF, STAT et régime fiscal sont tous remplis ; jamais effacé ensuite.
  profile_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.contact_kind not null default 'person',
  name text not null check (char_length(btrim(name)) between 1 and 200),
  company_name text check (char_length(company_name) <= 200),
  email text check (char_length(email) <= 320),
  phone text check (char_length(phone) <= 40),
  country text not null default 'MG' check (country ~ '^[A-Z]{2}$'),
  tags text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un contact se joint : téléphone ou e-mail obligatoire.
  constraint contacts_reachable check (
    nullif(btrim(email), '') is not null or nullif(btrim(phone), '') is not null
  ),
  unique (workspace_id, id)
);
create index contacts_workspace_idx on public.contacts (workspace_id) where archived_at is null;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Clé traduite par l'interface (prospect, contacted, call, quote, won, lost) ou nom libre.
  name text not null check (char_length(btrim(name)) between 1 and 100),
  position integer not null check (position >= 0),
  kind public.stage_kind not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, position),
  unique (workspace_id, id)
);
-- Exactement une étape « gagné » et une « perdu » par workspace (créées par
-- create_workspace ; le navigateur ne crée, ne modifie ni ne supprime qu'une étape « open »).
create unique index pipeline_stages_one_won_lost on public.pipeline_stages (workspace_id, kind)
  where kind <> 'open';

-- Les clés étrangères composites (workspace_id, x_id) empêchent de lier
-- une ligne à un objet d'un autre workspace.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null,
  stage_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  amount bigint check (amount >= 0),
  currency public.currency not null default 'MGA',
  expected_close_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, stage_id) references public.pipeline_stages (workspace_id, id) on delete restrict
);
create index deals_contact_idx on public.deals (contact_id);
create index deals_stage_idx on public.deals (workspace_id, stage_id) where archived_at is null;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null,
  deal_id uuid,
  kind public.activity_kind not null default 'note',
  body text check (char_length(body) <= 10000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete set null (deal_id)
);
create index activities_contact_idx on public.activities (contact_id, occurred_at desc);
create index activities_deal_idx on public.activities (deal_id) where deal_id is not null;

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  due_at timestamptz not null,
  done_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade
);
create index reminders_due_idx on public.reminders (workspace_id, due_at) where done_at is null;
create index reminders_to_notify_idx on public.reminders (due_at) where done_at is null and notified_at is null;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  number text,
  contact_id uuid not null,
  deal_id uuid,
  status public.quote_status not null default 'draft',
  currency public.currency not null default 'MGA',
  valid_until date,
  subtotal bigint not null default 0 check (subtotal >= 0),
  discount bigint not null default 0 check (discount between 0 and 1000000000000000),
  total bigint not null default 0 check (total >= 0),
  public_token text not null unique default public.generate_public_token()
    check (public_token ~ '^[A-Za-z0-9_-]{32}$'),
  pdf_path text check (pdf_path is null or starts_with(pdf_path, workspace_id::text || '/')),
  -- Copie figée à l'envoi : nom du client et informations légales du freelance.
  snapshot jsonb,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un brouillon n'a pas de numéro ; tout document émis en a un.
  constraint quotes_number_iff_issued check ((status = 'draft') = (number is null)),
  unique (workspace_id, number),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete restrict,
  -- Les opportunités s'archivent ; seule la suppression du workspace les efface (no action :
  -- vérifié en fin d'instruction, compatible avec la cascade).
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id)
);
create index quotes_workspace_idx on public.quotes (workspace_id, created_at desc);
create index quotes_contact_idx on public.quotes (contact_id);
create index quotes_deal_idx on public.quotes (deal_id) where deal_id is not null;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  number text,
  quote_id uuid,
  contact_id uuid not null,
  status public.invoice_status not null default 'draft',
  currency public.currency not null default 'MGA',
  -- Taux vers la devise par défaut du workspace, par UNITÉ MAJEURE : nombre d'unités
  -- majeures de la devise par défaut pour 1 unité majeure de la devise de la facture
  -- (1 EUR = 5000 MGA → 5000 ; 1 si même devise). Conversion d'un montant en unités
  -- mineures : montant × taux × 10^(décimales cible − décimales source), arrondi
  -- (convertMinor dans src/lib/money.ts). Figé à l'émission, comme la devise par
  -- défaut du workspace dès qu'une facture est émise (default_currency_locked).
  exchange_rate numeric(18, 6) not null default 1 check (exchange_rate > 0),
  issued_on date,
  due_on date,
  subtotal bigint not null default 0 check (subtotal >= 0),
  discount bigint not null default 0 check (discount between 0 and 1000000000000000),
  total bigint not null default 0 check (total >= 0),
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  public_token text not null unique default public.generate_public_token()
    check (public_token ~ '^[A-Za-z0-9_-]{32}$'),
  pdf_path text check (pdf_path is null or starts_with(pdf_path, workspace_id::text || '/')),
  -- Copie figée à l'émission : nom du client et informations légales du freelance.
  snapshot jsonb,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_number_iff_issued check ((status = 'draft') = (number is null)),
  constraint invoices_due_after_issue check (due_on is null or issued_on is null or due_on >= issued_on),
  unique (workspace_id, number),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete restrict,
  foreign key (workspace_id, quote_id) references public.quotes (workspace_id, id) on delete restrict
);
create index invoices_workspace_idx on public.invoices (workspace_id, status, due_on);
create index invoices_contact_idx on public.invoices (contact_id);
-- Un devis ne devient qu'une seule facture (hors facture annulée).
create unique index invoices_one_per_quote on public.invoices (quote_id)
  where quote_id is not null and status <> 'cancelled';

create table public.document_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  quote_id uuid,
  invoice_id uuid,
  position integer not null default 0 check (position >= 0),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  -- Deux décimales au plus, refusé sinon (un numeric(10, 2) arrondirait sans prévenir :
  -- 1.005 deviendrait 1.01). L'interface limite aussi la saisie à 2 décimales.
  quantity numeric not null default 1 check (quantity > 0 and quantity < 100000000),
  constraint document_lines_quantity_scale check (quantity = round(quantity, 2)),
  -- Plafond 10^15 unités mineures (au-delà : amount_too_large, levé par le trigger des
  -- lignes avant ces contrôles) : les sommes restent loin de la limite du bigint.
  unit_price bigint not null check (unit_price between 0 and 1000000000000000),
  line_total bigint not null default 0 check (line_total between 0 and 1000000000000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_lines_one_parent check (num_nonnulls(quote_id, invoice_id) = 1),
  foreign key (workspace_id, quote_id) references public.quotes (workspace_id, id) on delete cascade,
  foreign key (workspace_id, invoice_id) references public.invoices (workspace_id, id) on delete cascade
);
create index document_lines_quote_idx on public.document_lines (quote_id, position) where quote_id is not null;
create index document_lines_invoice_idx on public.document_lines (invoice_id, position) where invoice_id is not null;

create table public.number_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  doc_type public.doc_type not null,
  year integer not null check (year between 2000 and 9999),
  last_value integer not null default 0 check (last_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, doc_type, year)
);

create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider public.payment_provider not null,
  status public.payment_account_status not null default 'pending',
  -- Chiffrés côté serveur (AES-256-GCM, PAYMENT_SECRETS_KEY). Jamais lisibles par le navigateur.
  encrypted_api_key text,
  encrypted_signing_secret text,
  external_account_id text check (char_length(external_account_id) <= 200),
  manual_instructions text check (char_length(manual_instructions) <= 2000),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider),
  unique (workspace_id, id)
);

create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid not null,
  payment_account_id uuid not null,
  provider public.payment_provider not null,
  merchant_reference text not null check (char_length(merchant_reference) <= 200),
  provider_url text check (provider_url ~ '^https://'),
  notification_token text,
  status public.payment_link_status not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, merchant_reference),
  unique (workspace_id, id),
  foreign key (workspace_id, invoice_id) references public.invoices (workspace_id, id) on delete cascade,
  foreign key (workspace_id, payment_account_id) references public.payment_accounts (workspace_id, id) on delete restrict
);
create index payment_links_invoice_idx on public.payment_links (invoice_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id uuid not null,
  payment_link_id uuid,
  provider public.payment_provider not null,
  method public.payment_method not null,
  amount bigint not null check (amount > 0),
  fee bigint not null default 0 check (fee >= 0),
  currency public.currency not null,
  -- Idempotence : une notification rejouée ne crée pas un second paiement
  -- (unique par fournisseur : on conflict (provider, provider_reference)).
  provider_reference text check (char_length(provider_reference) <= 200),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference),
  foreign key (workspace_id, invoice_id) references public.invoices (workspace_id, id) on delete restrict,
  foreign key (workspace_id, payment_link_id) references public.payment_links (workspace_id, id) on delete set null (payment_link_id)
);
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_workspace_paid_idx on public.payments (workspace_id, paid_at desc);

-- Corps brut des notifications reçues, enregistré avant toute vérification.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null,
  raw_body text not null,
  payload jsonb,
  signature_valid boolean,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index webhook_events_unprocessed_idx on public.webhook_events (created_at) where processed_at is null;

-- updated_at sur chaque table. Préfixe « t90 » : les triggers BEFORE s'exécutent
-- par ordre alphabétique, celui-ci passe en dernier.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'workspaces', 'workspace_members', 'onboarding_answers', 'contacts',
    'pipeline_stages', 'deals', 'activities', 'reminders', 'quotes', 'invoices',
    'document_lines', 'number_sequences', 'payment_accounts', 'payment_links',
    'payments', 'webhook_events'
  ] loop
    execute format(
      'create trigger t90_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- profile_completed_at : posé une seule fois, quand les 5 champs du profil sont remplis.
-- Jamais saisi (ni par le navigateur, ni par le serveur), jamais effacé.
create function public.workspaces_profile_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.profile_completed_at := case when tg_op = 'UPDATE' then old.profile_completed_at end;
  if new.profile_completed_at is null
     and nullif(btrim(new.name), '') is not null
     and nullif(btrim(new.trade), '') is not null
     and nullif(btrim(new.nif), '') is not null
     and nullif(btrim(new.stat), '') is not null
     and new.tax_regime is not null then
    new.profile_completed_at := now();
  end if;
  return new;
end;
$$;

create trigger t20_profile_completion before insert or update on public.workspaces
  for each row execute function public.workspaces_profile_completion();

-- Offre Découverte : au plus 20 contacts actifs (non archivés). Contrôlé à la création
-- et au désarchivage. Le verrou sur la ligne du workspace (FOR NO KEY UPDATE : il ne
-- bloque pas les insertions qui le référencent) sérialise deux créations simultanées.
create function public.contacts_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  free_contacts constant integer := 20; -- même valeur que les constantes de canUse
  ws_plan public.plan;
begin
  if new.archived_at is not null
     or (tg_op = 'UPDATE' and old.archived_at is null and new.workspace_id = old.workspace_id) then
    return new;
  end if;
  -- Workspace d'un autre : la RLS refusera la ligne ; ne rien révéler de lui ici.
  if auth.uid() is not null and not public.is_member(new.workspace_id) then
    return new;
  end if;

  select w.plan into ws_plan from public.workspaces w where w.id = new.workspace_id for no key update;
  if ws_plan = 'decouverte' and (
    select count(*)
    from public.contacts c
    where c.workspace_id = new.workspace_id and c.archived_at is null and c.id <> new.id
  ) >= free_contacts then
    raise exception 'contact_limit_reached' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger t20_plan_limit before insert or update of archived_at, workspace_id on public.contacts
  for each row execute function public.contacts_plan_limit();

-- Suppression d'un compte (auth.users) : ses adhésions partent en cascade. Quand le
-- dernier propriétaire d'un workspace disparaît, le workspace et toutes ses données
-- (contacts, devis, factures émises, paiements) sont supprimés avec lui : rien ne reste
-- orphelin et inaccessible. Exporter les factures avant de supprimer un compte.
create function public.workspace_members_drop_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = old.workspace_id and m.role = 'owner'
  ) then
    delete from public.workspaces w where w.id = old.workspace_id;
  end if;
  return null;
end;
$$;

create trigger t50_drop_orphan_workspace after delete on public.workspace_members
  for each row execute function public.workspace_members_drop_orphan();

-- ---------------------------------------------------------------------------
-- Appartenance et RLS
-- ---------------------------------------------------------------------------
create function public.is_member(workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = is_member.workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

-- Workspaces de l'utilisateur courant. Les politiques l'appellent sous la forme
-- « workspace_id in (select public.my_workspace_ids()) » : évaluée une fois par requête
-- (sous-plan haché), pas une fois par ligne comme is_member(workspace_id).
-- SECURITY DEFINER : lit workspace_members sans repasser par sa propre politique.
create function public.my_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid());
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'workspaces', 'workspace_members', 'onboarding_answers', 'contacts',
    'pipeline_stages', 'deals', 'activities', 'reminders', 'quotes', 'invoices',
    'document_lines', 'number_sequences', 'payment_accounts', 'payment_links',
    'payments', 'webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Lecture réservée aux membres du workspace, partout.
  foreach t in array array[
    'onboarding_answers', 'contacts', 'pipeline_stages', 'deals', 'activities', 'reminders',
    'quotes', 'invoices', 'document_lines', 'payment_accounts', 'payment_links', 'payments'
  ] loop
    execute format(
      'create policy "members_select" on public.%1$I for select to authenticated
         using (workspace_id in (select public.my_workspace_ids()));', t);
  end loop;

  -- Écriture par les membres. Les colonnes réellement modifiables sont fixées par
  -- les privilèges (migration payments_and_privileges).
  foreach t in array array[
    'onboarding_answers', 'contacts', 'deals', 'activities', 'reminders',
    'quotes', 'invoices', 'document_lines', 'payment_accounts'
  ] loop
    execute format(
      'create policy "members_insert" on public.%1$I for insert to authenticated
         with check (workspace_id in (select public.my_workspace_ids()));
       create policy "members_update" on public.%1$I for update to authenticated
         using (workspace_id in (select public.my_workspace_ids())) with check (workspace_id in (select public.my_workspace_ids()));', t);
  end loop;

  -- Suppression : contacts et opportunités s'archivent (archived_at), jamais supprimés.
  foreach t in array array['onboarding_answers', 'activities', 'reminders', 'document_lines', 'payment_accounts'] loop
    execute format(
      'create policy "members_delete" on public.%1$I for delete to authenticated
         using (workspace_id in (select public.my_workspace_ids()));', t);
  end loop;

  -- Devis et factures : seuls les brouillons se suppriment (une facture émise est conservée).
  foreach t in array array['quotes', 'invoices'] loop
    execute format(
      'create policy "members_delete_drafts" on public.%1$I for delete to authenticated
         using (workspace_id in (select public.my_workspace_ids()) and status = ''draft'');', t);
  end loop;
end;
$$;

-- Étapes : le navigateur ne touche qu'aux étapes « open » (gagné et perdu sont fixes ;
-- kind n'est pas modifiable, cf. privilèges).
create policy "members_insert" on public.pipeline_stages for insert to authenticated
  with check (workspace_id in (select public.my_workspace_ids()) and kind = 'open');
create policy "members_update" on public.pipeline_stages for update to authenticated
  using (workspace_id in (select public.my_workspace_ids())) with check (workspace_id in (select public.my_workspace_ids()));
create policy "members_delete" on public.pipeline_stages for delete to authenticated
  using (workspace_id in (select public.my_workspace_ids()) and kind = 'open');

-- Paiements : le navigateur n'enregistre que des paiements manuels (provider = 'manual'),
-- en précisant le moyen utilisé hors plateforme (MVola, Orange Money, Airtel Money reçus
-- en direct, ou 'manual' : espèces, virement). Les paiements Papi / Whop ne viennent que
-- du serveur (clé secrète), après vérification du webhook.
-- « Marquer payée » = insérer un paiement manuel du reste dû ; la facture passe alors
-- à « payée » d'elle-même.
create policy "members_insert_manual" on public.payments for insert to authenticated
  with check (
    workspace_id in (select public.my_workspace_ids())
    and provider = 'manual' and method in ('manual', 'MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY')
    and provider_reference is null and payment_link_id is null
  );
create policy "members_update_manual" on public.payments for update to authenticated
  using (workspace_id in (select public.my_workspace_ids()) and provider = 'manual')
  with check (
    workspace_id in (select public.my_workspace_ids())
    and provider = 'manual' and method in ('manual', 'MVOLA', 'ORANGE_MONEY', 'AIRTEL_MONEY')
    and provider_reference is null and payment_link_id is null
  );
create policy "members_delete_manual" on public.payments for delete to authenticated
  using (workspace_id in (select public.my_workspace_ids()) and provider = 'manual');

-- payment_links : lecture seule (créés et mis à jour par le serveur).

-- Profil : uniquement sa propre ligne.
create policy "own_select" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own_insert" on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own_update" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Workspace : créé par create_workspace(), jamais supprimé par le navigateur
-- (la suppression emporterait des factures émises).
create policy "members_select" on public.workspaces for select to authenticated
  using (id in (select public.my_workspace_ids()));
create policy "members_update" on public.workspaces for update to authenticated
  using (id in (select public.my_workspace_ids())) with check (id in (select public.my_workspace_ids()));

-- Membres : lecture seule côté navigateur (gérés par create_workspace / le serveur).
create policy "members_select" on public.workspace_members for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));

-- Séquences : lecture seule ; seule la numérotation (SECURITY DEFINER) écrit.
create policy "members_select" on public.number_sequences for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()));

-- webhook_events : aucune politique, réservé au service role.

-- ---------------------------------------------------------------------------
-- Profil créé à l'inscription
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, locale)
  values (
    new.id,
    nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 200), ''),
    case when new.raw_user_meta_data ->> 'locale' = 'en' then 'en'::public.locale else 'fr'::public.locale end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- create_workspace : workspace + propriétaire + 6 étapes du pipeline.
-- Idempotent : au MVP un freelance = un workspace, un second appel (double clic,
-- connexion lente) renvoie le workspace existant.
-- ---------------------------------------------------------------------------
create function public.create_workspace(
  name text,
  default_currency public.currency default 'MGA',
  trade text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ws uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Sérialise les appels concurrents d'un même utilisateur.
  perform pg_advisory_xact_lock(hashtextextended('create_workspace:' || uid::text, 0));

  select m.workspace_id into ws
  from public.workspace_members m
  where m.user_id = uid and m.role = 'owner'
  order by m.created_at
  limit 1;
  if ws is not null then
    return ws;
  end if;

  insert into public.workspaces (name, default_currency, trade)
  values (btrim(create_workspace.name), create_workspace.default_currency, nullif(btrim(create_workspace.trade), ''))
  returning id into ws;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, uid, 'owner');

  insert into public.pipeline_stages (workspace_id, name, position, kind) values
    (ws, 'prospect', 0, 'open'),
    (ws, 'contacted', 1, 'open'),
    (ws, 'call', 2, 'open'),
    (ws, 'quote', 3, 'open'),
    (ws, 'won', 4, 'won'),
    (ws, 'lost', 5, 'lost');

  return ws;
end;
$$;
