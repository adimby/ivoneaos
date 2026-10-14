-- Devis et factures : numérotation sans trou, totaux, documents figés, pages publiques.
-- Codes d'erreur : 55000 (object_not_in_prerequisite_state) avec un message-clé
-- que l'interface traduit : document_frozen, document_empty, invalid_status_transition,
-- immutable_field, workspace_tax_info_missing, quote_not_accepted, exchange_rate_required,
-- invoice_due_before_issue, invoice_not_fully_paid, free_limit_reached, amount_too_large,
-- default_currency_locked, invoice_not_payable, currency_mismatch, contact_limit_reached,
-- quote_valid_until_past, payment_exceeds_balance, payment_date_in_future,
-- quantity_too_precise (traductions :
-- errors.db.* dans messages/fr.json et messages/en.json).
--
-- Cycle de vie : un document naît brouillon (sans numéro), reçoit ses lignes, puis est
-- émis par UPDATE (statut sent). Transitions autorisées :
--   devis   : draft → sent → accepted | declined | expired ; expired → sent
--   facture : draft → sent ↔ overdue → cancelled ; « paid » suit les paiements
--             (sent/overdue → paid quand le total est couvert, retour si un paiement
--             est supprimé). paid et cancelled sont finaux. « overdue » suit due_on :
--             sent → overdue seulement si l'échéance est passée (heure d'Antananarivo),
--             overdue → sent seulement si elle ne l'est pas (ou s'il n'y en a pas).
--
-- Devis envoyé : il reste modifiable (lignes, remise, devise, client) jusqu'à l'acceptation,
-- sans jamais redevenir vide (document_empty). Le client ne peut accepter que la version
-- qu'il a vue (accept_quote + version) ; après une modification, l'interface doit le dire
-- et proposer de régénérer le PDF et de renvoyer le lien. Accepté, il est figé.
--
-- PDF (pdf_path, bucket « documents ») : librement remplacé sur un brouillon et sur un devis
-- envoyé ; posé une seule fois (null → valeur) sur une facture émise et sur un devis accepté.
-- Le bucket n'accepte que des ajouts : chaque PDF a un nom nouveau (ex. version du devis).

-- ---------------------------------------------------------------------------
-- Numérotation : D-AAAA-NNNN (devis), F-AAAA-NNNN (factures), par workspace et par an.
-- SELECT … FOR UPDATE : deux émissions simultanées attendent l'une l'autre ;
-- si la transaction échoue, le numéro est rendu (pas de trou).
-- Offre Découverte : au plus 3 devis + factures envoyés par mois calendaire (heure
-- d'Antananarivo), comptés au passage hors brouillon (sent_at). Contrôlé ici sous un
-- verrou sur la ligne du workspace, commun aux deux types : deux émissions simultanées
-- (devis et facture compris) ne peuvent pas dépasser la limite. FOR NO KEY UPDATE ne
-- bloque pas les insertions qui référencent le workspace (clés étrangères).
-- Non exposée au navigateur : appelée seulement par le trigger d'émission.
-- ---------------------------------------------------------------------------
create function public.next_document_number(p_workspace_id uuid, p_doc_type public.doc_type)
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
  ws_plan public.plan;
  v integer;
begin
  -- Verrou d'abord sur le workspace, puis sur la séquence : toujours dans cet ordre.
  select w.plan into ws_plan from public.workspaces w where w.id = p_workspace_id for no key update;

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

-- t30 : attribue le numéro quand le document quitte le brouillon.
create function public.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text <> 'draft' and new.number is null then
    new.number := public.next_document_number(
      new.workspace_id,
      case tg_table_name when 'quotes' then 'quote'::public.doc_type else 'invoice'::public.doc_type end
    );
  end if;
  return new;
end;
$$;

-- Copie figée des parties, prise à l'émission : la page publique et le PDF d'un
-- document émis ne changent plus si le contact ou le profil est modifié ensuite.
create function public.document_snapshot(p_workspace_id uuid, p_contact_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'freelancer', jsonb_build_object(
      'business_name', w.name,
      'logo_path', w.logo_path,
      'nif', w.nif,
      'stat', w.stat,
      'tax_regime', w.tax_regime,
      'address', w.address,
      'invoice_footer', w.invoice_footer
    ),
    'client', jsonb_build_object('name', c.name, 'company_name', c.company_name)
  )
  from public.workspaces w
  join public.contacts c on c.workspace_id = w.id and c.id = p_contact_id
  where w.id = p_workspace_id;
$$;

-- ---------------------------------------------------------------------------
-- Gardes : naissance en brouillon, champs immuables, transitions, documents figés.
-- Elles s'exécutent après le calcul des totaux (t05) : new.total est à jour.
-- ---------------------------------------------------------------------------
create function public.quotes_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  editable constant text[] := array['pdf_path', 'updated_at'];
  today constant date := (now() at time zone 'Indian/Antananarivo')::date;
  issuing boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'invalid_status_transition' using errcode = '55000';
    end if;
    new.number := null; -- attribué à l'émission (t30)
    new.public_token := public.generate_public_token();
    new.snapshot := null;
    new.sent_at := null;
    new.accepted_at := null;
    return new;
  end if;

  if new.workspace_id <> old.workspace_id
     or new.public_token <> old.public_token
     or new.number is distinct from old.number then
    raise exception 'immutable_field' using errcode = '55000';
  end if;

  -- Un devis accepté est figé ; son PDF ne se pose qu'une fois (null → valeur).
  if old.status = 'accepted'
     and ((to_jsonb(new) - editable) <> (to_jsonb(old) - editable)
          or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)) then
    raise exception 'document_frozen' using errcode = '55000';
  end if;

  if new.status <> old.status
     and old.status::text || '>' || new.status::text not in (
       'draft>sent', 'sent>accepted', 'sent>declined', 'sent>expired', 'expired>sent') then
    raise exception 'invalid_status_transition' using errcode = '55000';
  end if;

  issuing := old.status = 'draft' and new.status <> 'draft';
  -- Pas d'envoi (ni de renvoi après expiration) d'un devis dont la validité est passée :
  -- le client recevrait un lien qu'il ne pourrait pas accepter.
  if new.status = 'sent' and old.status in ('draft', 'expired') and new.valid_until < today then
    raise exception 'quote_valid_until_past' using errcode = '55000';
  end if;
  -- Émis, un devis n'est jamais vide (y compris quand on retire ses lignes après l'envoi) :
  -- sinon il pourrait être accepté à 0 et ne jamais devenir une facture.
  if new.status <> 'draft'
     and (new.total <= 0 or not exists (select 1 from public.document_lines l where l.quote_id = new.id)) then
    raise exception 'document_empty' using errcode = '55000';
  end if;
  if issuing then
    new.sent_at := now();
  end if;

  -- Envoyé mais pas encore accepté : la copie suit un changement de client.
  if new.status <> 'draft' and (issuing or new.contact_id <> old.contact_id) then
    new.snapshot := public.document_snapshot(new.workspace_id, new.contact_id);
  end if;

  if new.status = 'accepted' and old.status <> 'accepted' then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

create function public.invoices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Seuls ces champs changent après émission (amount_paid et paid_at sont dérivés des paiements).
  editable constant text[] := array['status', 'amount_paid', 'paid_at', 'pdf_path', 'updated_at'];
  today constant date := (now() at time zone 'Indian/Antananarivo')::date;
  linked_quote_status public.quote_status;
  ws record;
  paid bigint;
  last_paid_at timestamptz;
  covered boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'invalid_status_transition' using errcode = '55000';
    end if;
    new.number := null; -- attribué à l'émission (t30)
    new.public_token := public.generate_public_token();
    new.snapshot := null;
    new.issued_on := null;
    new.sent_at := null;
    new.amount_paid := 0;
    new.paid_at := null;
  else
    if new.workspace_id <> old.workspace_id
       or new.public_token <> old.public_token
       or new.number is distinct from old.number then
      raise exception 'immutable_field' using errcode = '55000';
    end if;
    -- Facture émise : figée ; son PDF ne se pose qu'une fois (null → valeur).
    if old.status <> 'draft'
       and ((to_jsonb(new) - editable) <> (to_jsonb(old) - editable)
            or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)) then
      raise exception 'document_frozen' using errcode = '55000';
    end if;
    if new.status <> old.status
       and old.status::text || '>' || new.status::text not in (
         'draft>sent', 'sent>overdue', 'overdue>sent', 'sent>cancelled', 'overdue>cancelled',
         'sent>paid', 'overdue>paid', 'paid>sent', 'paid>overdue') then
      raise exception 'invalid_status_transition' using errcode = '55000';
    end if;
    -- « En retard » reflète due_on, que la demande vienne du navigateur ou du cron.
    if new.status <> old.status
       and ((new.status = 'overdue' and (new.due_on is null or new.due_on >= today))
            or (old.status = 'overdue' and new.status = 'sent' and new.due_on < today)) then
      raise exception 'invalid_status_transition' using errcode = '55000';
    end if;
  end if;

  -- « Devis accepté → Transformer en facture » : jamais depuis un autre devis.
  if new.quote_id is not null and (tg_op = 'INSERT' or new.quote_id is distinct from old.quote_id) then
    select q.status into linked_quote_status
    from public.quotes q
    where q.id = new.quote_id and q.workspace_id = new.workspace_id;
    if linked_quote_status is distinct from 'accepted' then
      raise exception 'quote_not_accepted' using errcode = '55000';
    end if;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.status = 'draft' and new.status <> 'draft' then
    -- NIF, STAT et régime fiscal obligatoires : sans eux, pas de facture.
    select w.nif, w.stat, w.tax_regime, w.default_currency into ws
    from public.workspaces w
    where w.id = new.workspace_id;
    if nullif(btrim(ws.nif), '') is null
       or nullif(btrim(ws.stat), '') is null
       or ws.tax_regime is null then
      raise exception 'workspace_tax_info_missing' using errcode = '55000';
    end if;
    if new.total <= 0 or not exists (select 1 from public.document_lines l where l.invoice_id = new.id) then
      raise exception 'document_empty' using errcode = '55000';
    end if;
    -- Taux vers la devise par défaut : 1 pour la même devise, saisi sinon.
    if new.currency = ws.default_currency then
      new.exchange_rate := 1;
    elsif new.exchange_rate = 1 then
      raise exception 'exchange_rate_required' using errcode = '55000';
    end if;
    -- Date d'émission = jour de l'attribution du numéro : dates et numéros restent dans le même ordre.
    new.issued_on := today;
    if new.due_on < today then
      raise exception 'invoice_due_before_issue' using errcode = '55000';
    end if;
    new.sent_at := now();
    new.snapshot := public.document_snapshot(new.workspace_id, new.contact_id);
  end if;

  -- Montant encaissé : toujours la somme des paiements ; « payée » en découle.
  select coalesce(sum(p.amount), 0)::bigint, max(p.paid_at) into paid, last_paid_at
  from public.payments p
  where p.invoice_id = new.id;
  new.amount_paid := paid;
  new.paid_at := null;

  if new.status <> 'draft' then
    covered := paid >= new.total;

    if new.status <> old.status then
      if new.status = 'paid' and not covered then
        raise exception 'invoice_not_fully_paid' using errcode = '55000';
      end if;
      if old.status = 'paid' and covered then
        raise exception 'invalid_status_transition' using errcode = '55000';
      end if;
    end if;

    if new.status in ('sent', 'overdue') and covered then
      new.status := 'paid';
    elsif new.status = 'paid' and not covered then
      new.status := case when new.due_on < today then 'overdue'::public.invoice_status
                         else 'sent'::public.invoice_status end;
    end if;
    new.paid_at := case when new.status = 'paid' then last_paid_at end;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Totaux : line_total = round(quantité × prix unitaire),
-- subtotal = somme des lignes, total = max(subtotal − remise, 0).
-- ---------------------------------------------------------------------------
-- Plafond : 10^15 unités mineures par ligne, sous-total et remise (amount_too_large),
-- au lieu de l'erreur brute « bigint out of range ».
create function public.compute_document_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_amount constant numeric := 1000000000000000;
  lines_sum numeric := 0;
begin
  if tg_op = 'INSERT' then
    lines_sum := 0; -- pas encore de lignes
  elsif tg_table_name = 'quotes' then
    select coalesce(sum(l.line_total), 0) into lines_sum
    from public.document_lines l where l.quote_id = new.id;
  else
    select coalesce(sum(l.line_total), 0) into lines_sum
    from public.document_lines l where l.invoice_id = new.id;
  end if;
  if lines_sum > max_amount or new.discount > max_amount then
    raise exception 'amount_too_large' using errcode = '55000';
  end if;
  new.subtotal := lines_sum;
  new.total := greatest(new.subtotal - new.discount, 0);
  return new;
end;
$$;

-- Lignes : refusées si le document parent est figé ; verrouille le parent pour
-- qu'une émission concurrente ne passe pas entre la vérification et l'écriture.
create function public.document_lines_before()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_amount constant numeric := 1000000000000000;
  parent_ids uuid[];
  frozen boolean;
begin
  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id
     or new.quote_id is distinct from old.quote_id
     or new.invoice_id is distinct from old.invoice_id) then
    raise exception 'immutable_field' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    parent_ids := array[old.quote_id, old.invoice_id];
  else
    parent_ids := array[new.quote_id, new.invoice_id];
  end if;

  if parent_ids[1] is not null then
    select q.status = 'accepted' into frozen
    from public.quotes q where q.id = parent_ids[1] for update;
  else
    select i.status <> 'draft' into frozen
    from public.invoices i where i.id = parent_ids[2] for update;
  end if;

  -- Parent introuvable : suppression en cascade ou ligne refusée ensuite par RLS / FK.
  if coalesce(frozen, false) then
    raise exception 'document_frozen' using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  -- Deux décimales au plus (contrainte document_lines_quantity_scale en filet) : message clair.
  if new.quantity <> round(new.quantity, 2) then
    raise exception 'quantity_too_precise' using errcode = '55000';
  end if;
  if new.unit_price > max_amount or round(new.quantity * new.unit_price) > max_amount then
    raise exception 'amount_too_large' using errcode = '55000';
  end if;
  new.line_total := round(new.quantity * new.unit_price)::bigint;
  return new;
end;
$$;

-- Après écriture d'une ligne : « touche » le parent pour recalculer ses totaux.
create function public.document_lines_after()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  if r.quote_id is not null then
    update public.quotes set updated_at = now() where id = r.quote_id;
  else
    update public.invoices set updated_at = now() where id = r.invoice_id;
  end if;
  return null;
end;
$$;

-- Ordre des triggers BEFORE (alphabétique) : totaux, garde, numéro, updated_at.
create trigger t05_totals before insert or update on public.quotes
  for each row execute function public.compute_document_totals();
create trigger t10_guard before insert or update on public.quotes
  for each row execute function public.quotes_guard();
create trigger t30_number before insert or update on public.quotes
  for each row execute function public.assign_document_number();

-- Devis accepté (par le client sur la page publique ou par la freelance) : l'opportunité
-- liée passe à l'étape « gagné » (spec P5.4). SECURITY DEFINER : accept_quote tourne
-- pour anon, qui n'a aucun droit sur deals.
create function public.quotes_mark_deal_won()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.deals d
  set stage_id = s.id
  from public.pipeline_stages s
  where d.id = new.deal_id
    and d.workspace_id = new.workspace_id
    and s.workspace_id = new.workspace_id
    and s.kind = 'won'
    and d.stage_id <> s.id;
  return null;
end;
$$;

create trigger t50_deal_won after update of status on public.quotes
  for each row
  when (new.status = 'accepted' and old.status <> 'accepted' and new.deal_id is not null)
  execute function public.quotes_mark_deal_won();

create trigger t05_totals before insert or update on public.invoices
  for each row execute function public.compute_document_totals();
create trigger t10_guard before insert or update on public.invoices
  for each row execute function public.invoices_guard();
create trigger t30_number before insert or update on public.invoices
  for each row execute function public.assign_document_number();

create trigger t10_guard before insert or update or delete on public.document_lines
  for each row execute function public.document_lines_before();
create trigger t50_touch_parent after insert or update or delete on public.document_lines
  for each row execute function public.document_lines_after();

-- ---------------------------------------------------------------------------
-- Pages publiques (rôle anon, sans service role) : uniquement ce que le client
-- doit voir, depuis la copie figée à l'émission. Un brouillon ou un jeton inconnu
-- renvoie null. Le logo (bucket privé « logos ») est lisible par anon seulement s'il
-- figure dans la copie figée d'un document émis (is_public_logo, migration storage).
-- ---------------------------------------------------------------------------
create function public.document_public_lines(p_quote_id uuid, p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'description', l.description,
        'quantity', l.quantity,
        'unit_price', l.unit_price,
        'line_total', l.line_total
      )
      order by l.position, l.created_at
    ),
    '[]'::jsonb
  )
  from public.document_lines l
  where (p_quote_id is not null and l.quote_id = p_quote_id)
     or (p_invoice_id is not null and l.invoice_id = p_invoice_id);
$$;

-- Version d'un devis : empreinte opaque (md5, texte) de tout ce que le client voit
-- (devise, validité, montants, parties, lignes). Elle ne change pas quand seul le PDF ou
-- updated_at change. Interne : appelée par get_public_quote et accept_quote.
create function public.quote_version(p_quote_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(jsonb_build_object(
    'currency', q.currency,
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

-- « version » : chaîne opaque à renvoyer telle quelle à accept_quote, qui refuse
-- ('outdated') si le devis a changé depuis.
create function public.get_public_quote(token text)
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

create function public.get_public_invoice(token text)
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

-- Le client accepte la version du devis qu'il a vue (« version » de get_public_quote,
-- chaîne opaque renvoyée telle quelle). Renvoie 'accepted' (y compris déjà accepté :
-- idempotent), 'outdated' si le devis a été modifié depuis (recharger la page),
-- 'unavailable' sinon (inconnu, brouillon, refusé, expiré ou validité dépassée).
create function public.accept_quote(token text, version text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_quote record;
begin
  -- Verrou d'abord : une écriture de ligne concurrente (qui verrouille aussi le devis)
  -- est terminée avant le calcul de la version, lu dans un nouvel instantané.
  select q.id, q.status, q.valid_until into current_quote
  from public.quotes q
  where q.public_token = accept_quote.token
  for update;

  if current_quote.status = 'accepted' then
    return 'accepted';
  end if;
  if current_quote.status is distinct from 'sent'
     or current_quote.valid_until < (now() at time zone 'Indian/Antananarivo')::date then
    return 'unavailable';
  end if;
  if public.quote_version(current_quote.id) is distinct from accept_quote.version then
    return 'outdated';
  end if;

  update public.quotes set status = 'accepted' where id = current_quote.id;
  return 'accepted';
end;
$$;

-- Devise par défaut figée dès qu'une facture est émise : les taux (exchange_rate) des
-- factures émises sont exprimés vers elle.
create function public.workspaces_currency_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_currency <> old.default_currency
     and exists (select 1 from public.invoices i where i.workspace_id = new.id and i.number is not null) then
    raise exception 'default_currency_locked' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger t10_currency_lock before update of default_currency on public.workspaces
  for each row execute function public.workspaces_currency_lock();
