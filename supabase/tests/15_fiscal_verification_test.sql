-- Vérification fiscale (docs/spec-mvp.md, « Vérification fiscale ») : formats NIF / STAT,
-- données fiscales jamais effacées, état non modifiable par la freelance et remis à zéro
-- au changement de NIF ou de STAT, dépôt, décisions des admins, plafond de 3 factures,
-- bucket privé « fiscal-documents ». Envois simultanés : scripts/test-db-concurrency.sh, cas 6.
begin;
\ir helpers.psql
select plan(70);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.create_user('ivonea@example.test') as admin \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
-- Photos : <workspace>/<uuid>.<ext>, seul format accepté par la politique de dépôt.
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_recto \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_verso \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_absent \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_encore \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_recto2 \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_verso2 \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_apres \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_recto3 \gset
select :'wa' || '/' || gen_random_uuid() || '.jpg' as f_verso3 \gset
reset role;
-- Admin : ajoutée à la main par le rôle serveur.
insert into public.platform_admins (user_id) values (:'admin');
-- Offre Lancement : seule la règle de la carte fiscale s'applique ici.
update public.workspaces set plan = 'lancement' where id = :'wa';

-- ---------------------------------------------------------------------------
-- Formats et données fiscales jamais effacées
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alice');
select is((select fiscal_status::text from public.workspaces where id = :'wa'), 'unverified', 'nouveau workspace : non vérifié');
select throws_ok(format($$ update public.workspaces set nif = '12345' where id = %L $$, :'wa'),
  '23514', null, 'NIF : 10 chiffres exactement');
select throws_ok(format($$ update public.workspaces set stat = '12345 11 2026 0 00001' where id = %L $$, :'wa'),
  '23514', null, 'STAT : 17 chiffres, sans espaces');
select lives_ok(format($$ update public.workspaces set nif = '1234567890' where id = %L $$, :'wa'),
  'NIF seul : permis (STAT et régime encore vides)');
select lives_ok(format($$ update public.workspaces set nif = null where id = %L $$, :'wa'),
  'données incomplètes : un champ peut encore être vidé');
select lives_ok(format($$ update public.workspaces set nif = '1234567890', stat = '12345112026000001', tax_regime = 'tva' where id = %L $$, :'wa'),
  'NIF, STAT et régime au bon format');
select throws_ok(format($$ update public.workspaces set stat = null where id = %L $$, :'wa'),
  '55000', 'fiscal_info_locked', 'données complètes : le STAT ne s''efface plus');
select throws_ok(format($$ update public.workspaces set tax_regime = null where id = %L $$, :'wa'),
  '55000', 'fiscal_info_locked', 'données complètes : le régime ne s''efface plus');

-- ---------------------------------------------------------------------------
-- La freelance ne change jamais l'état elle-même ni ne lit les tables réservées
-- ---------------------------------------------------------------------------
select throws_ok(format($$ update public.workspaces set fiscal_status = 'verified' where id = %L $$, :'wa'),
  '42501', null, 'fiscal_status non modifiable par la freelance');
select throws_ok(format($$ update public.workspaces set fiscal_status_at = now(), fiscal_rejection_reason = 'x' where id = %L $$, :'wa'),
  '42501', null, 'date et motif non modifiables par la freelance');
select throws_ok($$ select * from public.fiscal_verifications $$, '42501', null, 'demandes illisibles par la freelance');
select throws_ok($$ insert into public.fiscal_verifications (workspace_id, nif, stat) values (gen_random_uuid(), '1', '2') $$,
  '42501', null, 'demande jamais insérée directement');
select throws_ok($$ select * from public.platform_admins $$, '42501', null, 'liste des admins illisible');
select throws_ok(format($$ insert into public.platform_admins (user_id) values (%L) $$, :'alice'),
  '42501', null, 'personne ne se déclare admin');
select is(public.is_platform_admin(), false, 'alice n''est pas admin');
select throws_ok($$ select * from public.admin_fiscal_queue() $$, '42501', 'not_platform_admin', 'file des admins refusée');
select throws_ok($$ select * from public.admin_fiscal_history() $$, '42501', 'not_platform_admin', 'historique refusé');
select throws_ok(format($$ select * from public.admin_decide_fiscal_verification(%L, true) $$, gen_random_uuid()),
  '42501', 'not_platform_admin', 'décision d''admin refusée');
select throws_ok(format($$ select * from public.decide_fiscal_verification(%L, true, 'automatic') $$, gen_random_uuid()),
  '42501', null, 'décision automatique réservée au serveur');
select throws_ok($$ select * from public.platform_admin_emails() $$, '42501', null, 'e-mails des admins réservés au serveur');

-- ---------------------------------------------------------------------------
-- Storage : dépôt dans son dossier seulement, jamais relu ni supprimé par la freelance
-- ---------------------------------------------------------------------------
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'f_recto'),
  'la freelance dépose le recto dans son dossier');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'f_verso'),
  'et le verso');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'wb' || '/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'jamais dans le dossier d''un autre workspace');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'wa' || '/x/' || gen_random_uuid() || '.jpg'),
  '42501', null, 'jamais dans un sous-dossier (que le nettoyage ne verrait pas)');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'wa' || '/recto.jpg'),
  '42501', null, 'nom au format <uuid>.<jpg|png|webp> seulement');
select is((select count(*)::int from storage.objects where bucket_id = 'fiscal-documents'), 0,
  'la freelance ne lit ni ne liste ses propres photos');
-- Garde-fou de Storage levé pour tester la politique elle-même (comme l'API Storage).
select set_config('storage.allow_delete_query', 'true', true);
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'fiscal-documents' and name like %L $$, :'wa' || '/%')), 0,
  'ni ne les supprime');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where bucket_id = 'fiscal-documents' and name like %L $$, :'wa' || '/%')), 0,
  'ni ne les remplace');
select tests.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'fiscal-documents'), 0, 'jamais lisibles sans session');
select tests.authenticate_as(:'bob');
select is((select count(*)::int from storage.objects where bucket_id = 'fiscal-documents'), 0, 'ni par un autre membre');
select tests.as_service_role();
select is((select count(*)::int from storage.objects where bucket_id = 'fiscal-documents' and name like :'wa' || '/%'), 2,
  'le serveur les voit');

-- ---------------------------------------------------------------------------
-- Dépôt de la demande
-- ---------------------------------------------------------------------------
-- Serveur seulement : la route contrôle la session, le contenu des photos, lance la
-- lecture et prévient les admins (jamais contournée par un appel direct).
select tests.authenticate_as(:'alice');
select throws_ok(format($$ select public.submit_fiscal_verification(%L, %L, %L) $$, :'wa', :'f_recto', :'f_verso'),
  '42501', null, 'dépôt réservé au serveur, même pour un membre');
select tests.as_service_role();
select throws_ok(format($$ select public.submit_fiscal_verification(%L, %L, %L) $$, gen_random_uuid(), 'x/recto.jpg', 'x/verso.jpg'),
  '42501', 'not_authenticated', 'workspace inconnu : refusé');
select throws_ok(format($$ select public.submit_fiscal_verification(%L, %L, %L) $$, :'wa', :'f_recto', :'f_absent'),
  '55000', 'fiscal_documents_missing', 'photo absente du bucket : refusé');
select throws_ok(format($$ select public.submit_fiscal_verification(%L, %L, %L) $$, :'wa', :'f_recto', :'f_recto'),
  '55000', 'fiscal_documents_missing', 'recto et verso distincts');
select public.submit_fiscal_verification(:'wa', :'f_recto', :'f_verso') as req1 \gset
select is((select fiscal_status::text from public.workspaces where id = :'wa'), 'pending', 'dépôt : en cours de vérification');
select tests.authenticate_as(:'alice');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'f_encore'),
  '42501', null, 'en cours de vérification : plus aucun dépôt');
select tests.as_service_role();
select throws_ok(format($$ select public.submit_fiscal_verification(%L, %L, %L) $$, :'wa', :'f_recto', :'f_verso'),
  '55000', 'fiscal_already_pending', 'une seule demande en attente');

-- ---------------------------------------------------------------------------
-- Plafond : 3 factures émises au plus tant que la carte n'est pas vérifiée
-- ---------------------------------------------------------------------------
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000') returning id as ca \gset
select tests.new_invoice(:'wa', :'ca') as i1 \gset
select tests.new_invoice(:'wa', :'ca') as i2 \gset
select tests.new_invoice(:'wa', :'ca') as i3 \gset
select tests.new_invoice(:'wa', :'ca') as i4 \gset
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i1'), '1re facture émise');
select lives_ok(format($$ update public.invoices set status = 'cancelled' where id = %L $$, :'i1'), 'puis annulée (elle compte quand même)');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i2'), '2e facture émise');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i3'), '3e facture émise');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i4'),
  '55000', 'fiscal_verification_required', '4e facture refusée tant que la carte n''est pas vérifiée');
select is((select row(status::text, number) from public.invoices where id = :'i4'), row('draft'::text, null::text),
  'facture refusée : reste brouillon, sans numéro');
select lives_ok(format($$ update public.quotes set status = 'sent' where id = %L $$, tests.new_quote(:'wa', :'ca')),
  'les devis ne sont pas concernés');

-- ---------------------------------------------------------------------------
-- Décisions des admins
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'admin');
select is(public.is_platform_admin(), true, 'l''admin est reconnue');
select is((select count(*)::int from public.admin_fiscal_queue() q where q.id = :'req1'), 1, 'la demande est dans la file');
select throws_ok(format($$ select * from public.admin_decide_fiscal_verification(%L, false, '  ') $$, :'req1'),
  '55000', 'fiscal_reason_required', 'refus sans motif impossible');
select is(
  (select row(d.owner_email, d.front_path, d.back_path) from public.admin_decide_fiscal_verification(:'req1', false, 'Photo floue') d),
  row('alice@example.test'::text, (:'f_recto')::text, (:'f_verso')::text),
  'refus : e-mail de la freelance et photos à supprimer renvoyés');
select tests.authenticate_as(:'alice');
select is((select row(fiscal_status::text, fiscal_rejection_reason) from public.workspaces where id = :'wa'),
  row('rejected'::text, 'Photo floue'::text), 'la freelance voit le refus et son motif');
select tests.authenticate_as(:'admin');
select throws_ok(format($$ select * from public.admin_decide_fiscal_verification(%L, true) $$, :'req1'),
  '55000', 'fiscal_request_not_pending', 'une demande ne se décide qu''une fois');
select is((select count(*)::int from public.admin_fiscal_history() h where h.id = :'req1' and h.decided_by_email = 'ivonea@example.test'), 1,
  'historique : décision, admin et motif (sans images)');
reset role;
select is((select row(front_path, back_path, method::text) from public.fiscal_verifications where id = :'req1'),
  row(null::text, null::text, 'manual'::text), 'décision : chemins des photos effacés, méthode gardée');

-- Nouveau dépôt après un refus, puis validation : le plafond est levé.
select tests.authenticate_as(:'alice');
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L), ('fiscal-documents', %L) $$,
  :'f_recto2', :'f_verso2'), 'refusée : nouveau dépôt possible');
select tests.as_service_role();
select public.submit_fiscal_verification(:'wa', :'f_recto2', :'f_verso2') as req2 \gset
select tests.authenticate_as(:'admin');
select lives_ok(format($$ select * from public.admin_decide_fiscal_verification(%L, true) $$, :'req2'), 'l''admin valide');
select tests.authenticate_as(:'alice');
select is((select fiscal_status::text from public.workspaces where id = :'wa'), 'verified', 'carte vérifiée');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i4'), '4e facture émise après la vérification');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('fiscal-documents', %L) $$, :'f_apres'),
  '42501', null, 'carte vérifiée : plus aucun fichier déposé');
select tests.as_service_role();
select throws_ok(format($$ select public.submit_fiscal_verification(%L, %L, %L) $$, :'wa', :'f_recto2', :'f_verso2'),
  '55000', 'fiscal_already_verified', 'carte déjà vérifiée : pas de nouveau dépôt');
select tests.authenticate_as(:'alice');

-- ---------------------------------------------------------------------------
-- NIF ou STAT changé : retour à « non vérifié » (et la demande en attente est annulée)
-- ---------------------------------------------------------------------------
update public.workspaces set tax_regime = 'impot_synthetique' where id = :'wa';
select is((select fiscal_status::text from public.workspaces where id = :'wa'), 'verified', 'le régime seul ne change rien');
update public.workspaces set nif = '2234567890' where id = :'wa';
select is((select row(fiscal_status::text, fiscal_status_at) from public.workspaces where id = :'wa'),
  row('unverified'::text, null::timestamptz), 'NIF changé : non vérifié');
select tests.new_invoice(:'wa', :'ca') as i5 \gset
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, :'i5'),
  '55000', 'fiscal_verification_required', 'plafond de nouveau appliqué (4 factures déjà émises)');

reset role;
insert into storage.objects (bucket_id, name) values ('fiscal-documents', :'f_recto3'), ('fiscal-documents', :'f_verso3');
select tests.as_service_role();
select public.submit_fiscal_verification(:'wa', :'f_recto3', :'f_verso3') as req3 \gset
select tests.authenticate_as(:'alice');
update public.workspaces set stat = '22345112026000001' where id = :'wa';
reset role;
select is((select status from public.fiscal_verifications where id = :'req3'), 'cancelled', 'STAT changé : demande en attente annulée');
select is((select fiscal_status::text from public.workspaces where id = :'wa'), 'unverified', 'et retour à non vérifié');

-- ---------------------------------------------------------------------------
-- Décision automatique (serveur) et ordre des messages avec l'offre Découverte
-- ---------------------------------------------------------------------------
select tests.as_service_role();
select public.submit_fiscal_verification(:'wa', :'f_recto3', :'f_verso3') as req4 \gset
select lives_ok(format($$ select * from public.decide_fiscal_verification(%L, true, 'automatic') $$, :'req4'),
  'le serveur valide après une lecture concordante');
select is((select row(status, method::text, decided_by) from public.fiscal_verifications where id = :'req4'),
  row('verified'::text, 'automatic'::text, null::uuid), 'méthode automatique, sans admin');

reset role;
update public.workspaces set nif = '1234567890', stat = '12345112026000001', tax_regime = 'tva' where id = :'wb';
insert into public.contacts (workspace_id, name, phone) values (:'wb', 'Rabe', '+261340000001') returning id as cb \gset
select tests.authenticate_as(:'bob');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, tests.new_invoice(:'wb', :'cb')), 'Découverte : 1re facture');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, tests.new_invoice(:'wb', :'cb')), 'Découverte : 2e facture');
select lives_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, tests.new_invoice(:'wb', :'cb')), 'Découverte : 3e facture');
select throws_ok(format($$ update public.invoices set status = 'sent' where id = %L $$, tests.new_invoice(:'wb', :'cb')),
  '55000', 'fiscal_verification_required', 'les deux limites atteintes : la carte fiscale d''abord');

select * from finish();
rollback;
