-- Pages publiques : get_public_quote, get_public_invoice, accept_quote (rôle anon).
begin;
\ir helpers.psql
select plan(37);

select tests.create_user('alice@example.test') as alice \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
reset role;

update public.workspaces
set nif = '1234567890', stat = '12345 11 2026 0 00001', tax_regime = 'impot_synthetique',
    address = 'Lot II A 12, Antananarivo', logo_path = :'wa' || '/logo.png'
where id = :'wa';
insert into public.contacts (workspace_id, name, company_name, phone, email)
values (:'wa', 'Rakoto', 'Rakoto SARL', '+261340000000', 'rakoto@example.test') returning id as ca \gset

-- Opportunité à l'étape « devis », liée au devis envoyé.
select id as stage_quote from public.pipeline_stages where workspace_id = :'wa' and name = 'quote' \gset
insert into public.deals (workspace_id, contact_id, stage_id, title) values (:'wa', :'ca', :'stage_quote', 'Identité visuelle')
returning id as deal \gset

-- Devis envoyé, devis brouillon, devis expiré.
insert into public.quotes (workspace_id, contact_id, deal_id, valid_until) values (:'wa', :'ca', :'deal', current_date + 30)
returning id as qs, public_token as tqs \gset
insert into public.document_lines (workspace_id, quote_id, position, description, quantity, unit_price)
values (:'wa', :'qs', 1, 'Cartes', 2, 25000), (:'wa', :'qs', 0, 'Logo', 1, 400000);
update public.quotes set status = 'sent' where id = :'qs';
insert into public.quotes (workspace_id, contact_id) values (:'wa', :'ca') returning public_token as tqd \gset
select tests.new_quote(:'wa', :'ca') as qe \gset
update public.quotes set status = 'sent', valid_until = current_date where id = :'qe';
-- Le temps passe : la validité est maintenant dépassée (garde désactivée le temps de l'écriture).
alter table public.quotes disable trigger t10_guard;
update public.quotes set valid_until = current_date - 1 where id = :'qe';
alter table public.quotes enable trigger t10_guard;
select public_token as tqe from public.quotes where id = :'qe' \gset

-- Facture envoyée avec coordonnées manuelles et lien Papi actif (plus un lien expiré).
insert into public.invoices (workspace_id, contact_id, due_on) values (:'wa', :'ca', current_date + 15)
returning id as inv, public_token as ti \gset
insert into public.document_lines (workspace_id, invoice_id, description, unit_price)
values (:'wa', :'inv', 'Logo', 450000);
update public.invoices set status = 'sent' where id = :'inv';
insert into public.invoices (workspace_id, contact_id) values (:'wa', :'ca') returning public_token as tid \gset
insert into public.payment_accounts (workspace_id, provider, manual_instructions)
values (:'wa', 'manual', 'MVola 034 00 000 00 (Alice R.)');
insert into public.payment_accounts (workspace_id, provider, status, encrypted_api_key, encrypted_signing_secret)
values (:'wa', 'papi', 'connected', 'enc:key', 'enc:secret') returning id as pa \gset
insert into public.payment_links (workspace_id, invoice_id, payment_account_id, provider, merchant_reference, provider_url, status, expires_at, created_at)
values
  (:'wa', :'inv', :'pa', 'papi', 'IVN-1-1', 'https://app.papi.mg/pay/old', 'expired', now() - interval '1 day', now() - interval '2 days'),
  (:'wa', :'inv', :'pa', 'papi', 'IVN-1-2', 'https://app.papi.mg/pay/new', 'active', now() + interval '1 day', now());

select number as nqs from public.quotes where id = :'qs' \gset

-- Logos : celui des documents émis, et un autre fichier jamais utilisé sur un document.
insert into storage.objects (bucket_id, name) values ('logos', :'wa' || '/logo.png'), ('logos', :'wa' || '/brouillon.png');

-- Après émission, le contact et le profil changent : les documents émis gardent leur copie.
update public.contacts set name = 'Rakoto renommé', company_name = null where id = :'ca';
update public.workspaces set name = 'Nouveau nom', nif = '999' where id = :'wa';

-- ---------------------------------------------------------------------------
select tests.as_anon();

select public.get_public_quote(:'tqs') as pq \gset
select is((:'pq'::jsonb) ->> 'number', :'nqs', 'devis : bon document');
select is((:'pq'::jsonb) #>> '{freelancer,business_name}', 'Studio Alice', 'devis : nom commercial figé à l''envoi');
select is((:'pq'::jsonb) #>> '{freelancer,nif}', '1234567890', 'devis : NIF figé à l''envoi');
select is((:'pq'::jsonb) #>> '{freelancer,logo_path}', :'wa' || '/logo.png', 'devis : chemin du logo');
select is((:'pq'::jsonb) #>> '{client,name}', 'Rakoto', 'devis : nom du client figé à l''envoi');
select is((:'pq'::jsonb) ->> 'total', '450000', 'devis : total');
select is((:'pq'::jsonb) ->> 'currency', 'MGA', 'devis : devise');
select is(jsonb_array_length((:'pq'::jsonb) -> 'lines'), 2, 'devis : lignes');
select is((:'pq'::jsonb) #>> '{lines,0,description}', 'Logo', 'devis : lignes dans l''ordre');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(:'pq'::jsonb) k),
  array['accepted_at', 'client', 'currency', 'discount', 'freelancer', 'lines', 'number', 'sent_at',
        'status', 'subtotal', 'total', 'type', 'valid_until', 'version'],
  'devis : aucune donnée interne (id, workspace, jeton, contact complet)'
);
select is((:'pq'::jsonb) -> 'client', '{"name": "Rakoto", "company_name": "Rakoto SARL"}'::jsonb,
  'devis : ni e-mail ni téléphone du client');
select is(public.get_public_quote(:'tqd'), null, 'devis brouillon : rien');
select is(public.get_public_quote('inconnu'), null, 'jeton inconnu : rien');
select is(public.get_public_quote(:'ti'), null, 'jeton de facture sur la fonction devis : rien');

select public.get_public_invoice(:'ti') as pi \gset
select is((:'pi'::jsonb) #>> '{payment,payment_link_url}', 'https://app.papi.mg/pay/new',
  'facture : lien de paiement actif le plus récent');
select is((:'pi'::jsonb) #>> '{payment,manual_instructions}', 'MVola 034 00 000 00 (Alice R.)',
  'facture : coordonnées de paiement manuelles');
select is((:'pi'::jsonb) ->> 'due_on', (current_date + 15)::text, 'facture : échéance');
select is((:'pi'::jsonb) -> 'client', '{"name": "Rakoto", "company_name": "Rakoto SARL"}'::jsonb,
  'facture : client tel qu''à l''émission');
select is((:'pi'::jsonb) #>> '{freelancer,nif}', '1234567890', 'facture : NIF tel qu''à l''émission');
select ok(not ((:'pi'::jsonb)::text ~ '(enc:|IVN-|"id"|workspace_id|public_token|rakoto@)'),
  'facture : ni secret, ni référence, ni identifiant interne');
select is(public.get_public_invoice(:'tid'), null, 'facture brouillon : rien');
select is(public.get_public_invoice('inconnu'), null, 'facture : jeton inconnu, rien');

select is((select array_agg(name) from storage.objects where bucket_id = 'logos'), array[:'wa' || '/logo.png'],
  'anon lit le logo figurant sur un document émis, et aucun autre fichier du bucket privé');
select is(public.is_public_logo(:'wa' || '/brouillon.png'), false, 'logo jamais utilisé sur un document émis : non public');

select throws_ok(format($$ select public.document_snapshot(%L, %L) $$, :'wa', :'ca'),
  '42501', null, 'anon ne peut pas appeler document_snapshot');

-- accept_quote : le client accepte la version qu'il a vue.
select (:'pq'::jsonb) ->> 'version' as vqs \gset
select matches(:'vqs'::text, '^[0-9a-f]{32}$', 'version : chaîne opaque (empreinte), à renvoyer telle quelle');
select is(public.accept_quote('inconnu', :'vqs'), 'unavailable', 'accept_quote : jeton inconnu refusé');
select is(public.accept_quote(:'tqd', :'vqs'), 'unavailable', 'accept_quote : brouillon refusé');
select is(public.accept_quote(:'tqe', public.get_public_quote(:'tqe') ->> 'version'), 'unavailable',
  'accept_quote : devis expiré refusé');
select is(public.accept_quote(:'tqs', 'version-inventee'), 'outdated', 'accept_quote : version inconnue refusée');

-- Régénérer le PDF ne change pas la version vue par le client.
reset role;
update public.quotes set pdf_path = :'wa' || '/quotes/qs-v2.pdf' where id = :'qs';
select tests.as_anon();
select is(public.get_public_quote(:'tqs') ->> 'version', :'vqs'::text, 'version inchangée quand seul le PDF change');

-- Le freelance modifie le devis envoyé après que le client l'a ouvert.
reset role;
insert into public.document_lines (workspace_id, quote_id, position, description, unit_price)
values (:'wa', :'qs', 2, 'Option ajoutée', 100000);
select tests.as_anon();
select is(public.accept_quote(:'tqs', :'vqs'), 'outdated', 'accept_quote : devis modifié depuis la lecture, refusé');
select is((public.get_public_quote(:'tqs')) ->> 'total', '550000', 'le client recharge et voit le nouveau total');
select public.get_public_quote(:'tqs') ->> 'version' as vqs2 \gset
select is(public.accept_quote(:'tqs', :'vqs2'), 'accepted', 'accept_quote : version vue acceptée');
select is(public.accept_quote(:'tqs', :'vqs2'), 'accepted', 'accept_quote : second clic sans erreur (idempotent)');
reset role;
select is((select status::text from public.quotes where id = :'qs'), 'accepted', 'le devis est passé à accepté');
select is((select s.kind::text from public.deals d join public.pipeline_stages s on s.id = d.stage_id where d.id = :'deal'),
  'won', 'devis accepté par le client : l''opportunité passe à « gagné »');

select * from finish();
rollback;
