-- Devis et factures dans l'application (parcours P5, étapes 1 à 4) :
--   1. Langue du document (fr, en) : PDF, page publique et message de partage.
--   2. Enregistrement atomique d'un document et de ses lignes (save_quote, save_invoice).
--   3. « Transformer en facture » : facture brouillon avec les lignes du devis accepté.
--   4. Pages publiques : la langue du document est renvoyée ; elle entre dans la
--      version d'un devis (accept_quote).
--   5. Limite d'envoi des e-mails de document (claim_document_email, release_document_email).
--   6. Existence d'une page publique (public_document_exists), pour répondre 404.
-- Codes d'erreur : 55000 + message-clé (errors.db.*), comme la migration billing.

-- ---------------------------------------------------------------------------
-- 1. Langue du document. Figée avec le reste à l'émission d'une facture et à
-- l'acceptation d'un devis (gardes existantes : elle n'est pas dans « editable »).
-- ---------------------------------------------------------------------------
alter table public.quotes add column language public.locale not null default 'fr';
alter table public.invoices add column language public.locale not null default 'fr';

grant insert (language), update (language) on public.quotes to authenticated;
grant insert (language), update (language) on public.invoices to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lignes d'un document, remplacées dans la même transaction que l'en-tête.
-- ---------------------------------------------------------------------------
-- Prépare le remplacement des lignes : insère les nouvelles (positions 0, 1, 2…) et
-- renvoie les identifiants des anciennes, à supprimer par l'appelant APRÈS la mise à
-- jour de l'en-tête. Dans cet ordre, le sous-total ne passe jamais sous sa valeur
-- finale : un devis envoyé n'est jamais vu vide ni à 0 en cours de route (document_empty).
-- Lignes identiques (description, quantité, prix, ordre) : rien n'est touché, et la
-- version d'un devis envoyé ne change pas (le client peut toujours l'accepter).
-- Droits de l'appelant : RLS et gardes des lignes appliquées.
create function public.stage_document_lines(
  p_workspace_id uuid,
  p_quote_id uuid,
  p_invoice_id uuid,
  p_lines jsonb
)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  max_lines constant integer := 50;
  wanted jsonb;
  current_lines jsonb;
  old_ids uuid[];
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'document_empty' using errcode = '55000';
  end if;
  if jsonb_array_length(p_lines) > max_lines then
    raise exception 'too_many_lines' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_array(
           btrim(e ->> 'description'), (e ->> 'quantity')::numeric, (e ->> 'unit_price')::bigint)
         order by n), '[]'::jsonb)
  into wanted
  from jsonb_array_elements(p_lines) with ordinality as t(e, n);

  select coalesce(jsonb_agg(jsonb_build_array(l.description, l.quantity, l.unit_price)
           order by l.position, l.created_at, l.id), '[]'::jsonb),
         coalesce(array_agg(l.id), '{}')
  into current_lines, old_ids
  from public.document_lines l
  where l.workspace_id = p_workspace_id
    and ((p_quote_id is not null and l.quote_id = p_quote_id)
         or (p_invoice_id is not null and l.invoice_id = p_invoice_id));

  if wanted = current_lines then
    return '{}';
  end if;

  insert into public.document_lines (workspace_id, quote_id, invoice_id, position, description, quantity, unit_price)
  select p_workspace_id, p_quote_id, p_invoice_id, (n - 1)::integer,
         e ->> 0, (e ->> 1)::numeric, (e ->> 2)::bigint
  from jsonb_array_elements(wanted) with ordinality as t(e, n);

  return old_ids;
end;
$$;

-- Crée (p_id absent) ou modifie un devis et remplace ses lignes, en une transaction.
-- Renvoie l'identifiant du devis, ou null si p_id n'est pas un devis de ce workspace.
create function public.save_quote(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_currency public.currency,
  p_valid_until date,
  p_discount bigint,
  p_language public.locale,
  p_lines jsonb,
  p_deal_id uuid default null,
  p_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  qid uuid := p_id;
  old_ids uuid[];
begin
  if qid is null then
    insert into public.quotes (workspace_id, contact_id, deal_id, currency, valid_until, discount, language)
    values (p_workspace_id, p_contact_id, p_deal_id, p_currency, p_valid_until, p_discount, p_language)
    returning id into qid;
  else
    perform 1 from public.quotes q where q.id = qid and q.workspace_id = p_workspace_id for update;
    if not found then
      return null;
    end if;
  end if;

  old_ids := public.stage_document_lines(p_workspace_id, qid, null, p_lines);

  if p_id is not null then
    update public.quotes
    set contact_id = p_contact_id, deal_id = p_deal_id, currency = p_currency,
        valid_until = p_valid_until, discount = p_discount, language = p_language
    where id = qid;
  end if;

  delete from public.document_lines where id = any (old_ids);
  return qid;
end;
$$;

-- Même chose pour une facture brouillon (une facture émise est figée : document_frozen).
-- Le devis d'origine (quote_id) ne change pas ici : il est posé par « Transformer en facture ».
create function public.save_invoice(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_currency public.currency,
  p_exchange_rate numeric,
  p_due_on date,
  p_discount bigint,
  p_language public.locale,
  p_lines jsonb,
  p_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  iid uuid := p_id;
  old_ids uuid[];
begin
  if iid is null then
    insert into public.invoices (workspace_id, contact_id, currency, exchange_rate, due_on, discount, language)
    values (p_workspace_id, p_contact_id, p_currency, p_exchange_rate, p_due_on, p_discount, p_language)
    returning id into iid;
  else
    perform 1 from public.invoices i where i.id = iid and i.workspace_id = p_workspace_id for update;
    if not found then
      return null;
    end if;
  end if;

  old_ids := public.stage_document_lines(p_workspace_id, null, iid, p_lines);

  if p_id is not null then
    update public.invoices
    set contact_id = p_contact_id, currency = p_currency, exchange_rate = p_exchange_rate,
        due_on = p_due_on, discount = p_discount, language = p_language
    where id = iid;
  end if;

  delete from public.document_lines where id = any (old_ids);
  return iid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Devis accepté → facture brouillon : même client, devise, remise, langue et lignes.
-- Idempotent : renvoie la facture déjà créée depuis ce devis (hors facture annulée).
-- Devis non accepté : quote_not_accepted (garde des factures). Échéance à 15 jours,
-- modifiable tant que la facture est en brouillon. null si le devis est inconnu (RLS).
-- ---------------------------------------------------------------------------
create function public.create_invoice_from_quote(p_quote_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  today constant date := (now() at time zone 'Indian/Antananarivo')::date;
  q record;
  iid uuid;
begin
  -- Verrou : deux clics simultanés attendent l'un l'autre, le second retrouve la facture.
  select x.id, x.workspace_id, x.contact_id, x.currency, x.discount, x.language into q
  from public.quotes x
  where x.id = p_quote_id
  for update;
  if q.id is null then
    return null;
  end if;

  select i.id into iid
  from public.invoices i
  where i.quote_id = q.id and i.status <> 'cancelled'
  order by i.created_at
  limit 1;
  if iid is not null then
    return iid;
  end if;

  insert into public.invoices (workspace_id, contact_id, quote_id, currency, discount, language, due_on)
  values (q.workspace_id, q.contact_id, q.id, q.currency, q.discount, q.language, today + 15)
  returning id into iid;

  insert into public.document_lines (workspace_id, invoice_id, position, description, quantity, unit_price)
  select l.workspace_id, iid, l.position, l.description, l.quantity, l.unit_price
  from public.document_lines l
  where l.quote_id = q.id;

  return iid;
end;
$$;

revoke execute on function public.stage_document_lines(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.save_quote(uuid, uuid, public.currency, date, bigint, public.locale, jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.save_invoice(uuid, uuid, public.currency, numeric, date, bigint, public.locale, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.create_invoice_from_quote(uuid) from public, anon, authenticated;
-- Droits de l'appelant (RLS appliquée) : sans risque pour une personne connectée.
grant execute on function public.stage_document_lines(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_quote(uuid, uuid, public.currency, date, bigint, public.locale, jsonb, uuid, uuid)
  to authenticated;
grant execute on function public.save_invoice(uuid, uuid, public.currency, numeric, date, bigint, public.locale, jsonb, uuid)
  to authenticated;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Pages publiques : la langue du document en plus (mêmes règles d'accès).
-- ---------------------------------------------------------------------------
-- Version d'un devis : la langue en fait partie (le client voit le devis, le PDF et les
-- messages dans cette langue). Changer seulement la langue d'un devis envoyé invalide
-- donc la version déjà affichée : accept_quote répond 'outdated'. Droits inchangés
-- (create or replace garde les privilèges : interne, pas d'accès anon ni authenticated).
create or replace function public.quote_version(p_quote_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(jsonb_build_object(
    'currency', q.currency,
    'language', q.language,
    'valid_until', q.valid_until,
    'subtotal', q.subtotal,
    'discount', q.discount,
    'total', q.total,
    'contact_id', q.contact_id,
    'snapshot', q.snapshot,
    'lines', (
      select coalesce(jsonb_agg(
        jsonb_build_array(l.id, l.position, l.description, l.quantity, l.unit_price, l.line_total)
        order by l.position, l.created_at, l.id), '[]'::jsonb)
      from public.document_lines l
      where l.quote_id = q.id
    )
  )::text)
  from public.quotes q
  where q.id = p_quote_id;
$$;

create or replace function public.get_public_quote(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'quote',
    'number', q.number,
    'status', q.status,
    'language', q.language,
    'currency', q.currency,
    'valid_until', q.valid_until,
    'sent_at', q.sent_at,
    'accepted_at', q.accepted_at,
    'subtotal', q.subtotal,
    'discount', q.discount,
    'total', q.total,
    'version', public.quote_version(q.id),
    'freelancer', q.snapshot -> 'freelancer',
    'client', q.snapshot -> 'client',
    'lines', public.document_public_lines(q.id, null)
  )
  from public.quotes q
  where q.public_token = get_public_quote.token
    and q.status <> 'draft';
$$;

create or replace function public.get_public_invoice(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'invoice',
    'number', i.number,
    'status', i.status,
    'language', i.language,
    'currency', i.currency,
    'issued_on', i.issued_on,
    'due_on', i.due_on,
    'paid_at', i.paid_at,
    'subtotal', i.subtotal,
    'discount', i.discount,
    'total', i.total,
    'amount_paid', i.amount_paid,
    'freelancer', i.snapshot -> 'freelancer',
    'client', i.snapshot -> 'client',
    'lines', public.document_public_lines(null, i.id),
    'payment', case when i.status in ('sent', 'overdue') then jsonb_build_object(
      'manual_instructions', (
        select a.manual_instructions
        from public.payment_accounts a
        where a.workspace_id = i.workspace_id and a.provider = 'manual'
      ),
      'payment_link_url', (
        select pl.provider_url
        from public.payment_links pl
        where pl.invoice_id = i.id
          and pl.status = 'active'
          and (pl.expires_at is null or pl.expires_at > now())
        order by pl.created_at desc
        limit 1
      )
    ) end
  )
  from public.invoices i
  where i.public_token = get_public_invoice.token
    and i.status <> 'draft';
$$;

-- ---------------------------------------------------------------------------
-- 5. E-mail d'un document au client (Resend, domaine Ivonea) : au plus un envoi par
-- document toutes les 2 minutes, pour tous les serveurs (double appui, rafales).
-- Table interne : aucun accès direct, seulement claim_document_email.
-- ---------------------------------------------------------------------------
create table public.document_emails (
  -- Devis ou facture émis (identifiants uuid distincts entre les deux tables).
  document_id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.document_emails enable row level security;
revoke all on public.document_emails from public, anon, authenticated;

-- Heure de la réservation : l'envoi est à faire maintenant ; null : document inconnu,
-- brouillon, hors de mes workspaces, ou déjà envoyé il y a moins de 2 minutes.
create function public.claim_document_email(p_document_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
  claimed timestamptz;
begin
  select q.workspace_id into ws from public.quotes q where q.id = p_document_id and q.status <> 'draft';
  if ws is null then
    select i.workspace_id into ws from public.invoices i where i.id = p_document_id and i.status <> 'draft';
  end if;
  if ws is null or not public.is_member(ws) then
    return null;
  end if;

  insert into public.document_emails as e (document_id, workspace_id)
  values (p_document_id, ws)
  on conflict (document_id) do update set sent_at = now()
  where e.sent_at <= now() - interval '2 minutes'
  returning e.sent_at into claimed;
  return claimed;
end;
$$;

revoke execute on function public.claim_document_email(uuid) from public, anon, authenticated;
grant execute on function public.claim_document_email(uuid) to authenticated;

-- Envoi échoué (Resend) : rien n'est parti, la réservation est rendue pour permettre un
-- nouvel essai tout de suite. Seulement la réservation exacte (son heure, jamais
-- renvoyée au navigateur) : impossible de lever la limite après un envoi réussi.
create function public.release_document_email(p_document_id uuid, p_claimed_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.document_emails e
  where e.document_id = p_document_id and e.sent_at = p_claimed_at and public.is_member(e.workspace_id);
$$;

revoke execute on function public.release_document_email(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.release_document_email(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Le proxy répond 404 (et non une page 200 « introuvable ») à un jeton inconnu ou
-- à un brouillon, avant que la page ne commence à s'afficher. Rien de plus que ce que
-- révèlent déjà get_public_quote et get_public_invoice : l'existence d'un document émis.
-- ---------------------------------------------------------------------------
create function public.public_document_exists(token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.quotes q where q.public_token = public_document_exists.token and q.status <> 'draft')
    or exists (
      select 1 from public.invoices i where i.public_token = public_document_exists.token and i.status <> 'draft');
$$;

revoke execute on function public.public_document_exists(text) from public;
grant execute on function public.public_document_exists(text) to anon, authenticated;
