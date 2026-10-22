-- Personnalisation : apparence (profil) et image de marque (workspace), copie figée,
-- bannière dans le bucket des logos.
begin;
\ir helpers.psql
select plan(32);

select tests.create_user('alice@example.test') as alice \gset
select tests.create_user('bob@example.test') as bob \gset
select tests.authenticate_as(:'bob');
select public.create_workspace('Atelier Bob') as wb \gset
select tests.authenticate_as(:'alice');
select public.create_workspace('Studio Alice') as wa \gset
reset role;

update public.workspaces set nif = '1234567890', stat = '12345112026000001', tax_regime = 'tva', plan = 'lancement'
where id = :'wa';
insert into public.contacts (workspace_id, name, phone) values (:'wa', 'Rakoto', '+261340000000') returning id as ca \gset

-- ---------------------------------------------------------------------------
-- 1. Apparence : défaut Océan clair, chacun sa ligne, valeurs connues seulement.
-- ---------------------------------------------------------------------------
select is((select theme_mode || '.' || theme_palette from public.profiles where user_id = :'alice'), 'light.ocean',
  'apparence par défaut : Océan clair (aspect actuel)');

select tests.authenticate_as(:'alice');
select is(tests.affected(format($$ update public.profiles set theme_mode = 'dark', theme_palette = 'foret' where user_id = %L $$, :'alice')), 1,
  'Alice choisit le mode sombre et la palette Forêt');
select is((select theme_mode || '.' || theme_palette from public.profiles where user_id = :'alice'), 'dark.foret',
  'choix enregistré dans son profil');
select is(tests.affected(format($$ update public.profiles set theme_mode = 'dark' where user_id = %L $$, :'bob')), 0,
  'Alice ne change pas l''apparence de Bob');
select throws_ok(format($$ update public.profiles set theme_mode = 'neon' where user_id = %L $$, :'alice'), '23514', null,
  'mode inconnu refusé');
select throws_ok(format($$ update public.profiles set theme_palette = 'rose' where user_id = %L $$, :'alice'), '23514', null,
  'palette inconnue refusée');
select lives_ok(format($$ update public.profiles set theme_mode = 'auto' where user_id = %L $$, :'alice'),
  'mode automatique accepté');
select throws_ok(format($$ update public.profiles set created_at = now() where user_id = %L $$, :'alice'), '42501', null,
  'les autres colonnes restent protégées (date d''inscription)');

-- ---------------------------------------------------------------------------
-- 2. Image de marque : défauts, membres seulement, valeurs contrôlées par la base.
-- ---------------------------------------------------------------------------
select is(
  (select row(brand_show_logo, brand_logo_size, brand_logo_position, brand_banner_path, brand_primary_color, brand_accent_color, brand_font)::text
   from public.workspaces where id = :'wa'),
  row(true, 'medium', 'left', null::text, '#01515A', '#A45C36', 'liberation-sans')::text,
  'image de marque par défaut : l''aspect Océan d''origine');
select is(tests.affected(format($$ update public.workspaces set brand_font = 'spectral', brand_primary_color = '#5B2B5E',
  brand_accent_color = '#F2C14E', brand_show_logo = false, brand_logo_size = 'large', brand_logo_position = 'center' where id = %L $$, :'wa')), 1,
  'Alice règle son image de marque');
select is(tests.affected(format($$ update public.workspaces set brand_font = 'nunito' where id = %L $$, :'wb')), 0,
  'Alice ne touche pas l''image de marque de Bob');
select throws_ok(format($$ update public.workspaces set brand_font = 'comic-sans' where id = %L $$, :'wa'), '23514', null,
  'police inconnue refusée');
select throws_ok(format($$ update public.workspaces set brand_primary_color = 'red' where id = %L $$, :'wa'), '23514', null,
  'couleur hors format #RRVVBB refusée');
select throws_ok(format($$ update public.workspaces set brand_accent_color = '#f2c14e' where id = %L $$, :'wa'), '23514', null,
  'couleur normalisée en majuscules par le serveur');
select throws_ok(format($$ update public.workspaces set brand_logo_size = 'huge' where id = %L $$, :'wa'), '23514', null,
  'taille de logo inconnue refusée');
select throws_ok(format($$ update public.workspaces set brand_banner_path = %L where id = %L $$, :'wb' || '/banner-1.png', :'wa'), '23514', null,
  'bannière hors du dossier du workspace refusée');
select throws_ok(format($$ update public.workspaces set plan = 'contrat_signe' where id = %L $$, :'wa'), '42501', null,
  'l''offre reste réservée au serveur');

-- ---------------------------------------------------------------------------
-- 3. Bannière : bucket « logos », dossier du workspace, ajouts seulement.
-- ---------------------------------------------------------------------------
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wa' || '/banner-1.png'),
  'Alice dépose une bannière dans son dossier');
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wb' || '/banner-1.png'),
  '42501', null, 'pas dans le dossier de Bob');
select lives_ok(format($$ update public.workspaces set brand_banner_path = %L where id = %L $$, :'wa' || '/banner-1.png', :'wa'),
  'bannière enregistrée');
select is(public.is_public_logo(:'wa' || '/banner-1.png'), false, 'bannière d''aucun document émis : privée');

-- ---------------------------------------------------------------------------
-- 4. Copie figée : la marque de l'envoi, inchangée ensuite.
-- ---------------------------------------------------------------------------
update public.workspaces set logo_path = :'wa' || '/logo.png' where id = :'wa';
select tests.new_quote(:'wa', :'ca', 450000) as q \gset
update public.quotes set status = 'sent' where id = :'q';
select is(
  (select snapshot #> '{freelancer,brand}' from public.quotes where id = :'q'),
  jsonb_build_object('show_logo', false, 'logo_size', 'large', 'logo_position', 'center', 'banner_path', :'wa' || '/banner-1.png',
    'primary_color', '#5B2B5E', 'accent_color', '#F2C14E', 'font', 'spectral'),
  'le devis envoyé fige l''image de marque');
select is((select snapshot #>> '{freelancer,logo_path}' from public.quotes where id = :'q'), null,
  'logo masqué : absent de la copie figée');
update public.workspaces set brand_font = 'montserrat', brand_primary_color = '#1F5A3D', brand_banner_path = null where id = :'wa';
select is((select snapshot #>> '{freelancer,brand,font}' from public.quotes where id = :'q'), 'spectral',
  'changer de marque ensuite ne modifie pas le document envoyé');
select tests.new_quote(:'wa', :'ca', 100000) as q2 \gset
update public.quotes set status = 'sent' where id = :'q2';
select is((select snapshot #>> '{freelancer,brand,font}' from public.quotes where id = :'q2'), 'montserrat',
  'le document suivant prend la nouvelle marque');

select is(public.is_public_logo(:'wa' || '/banner-1.png'), true, 'bannière d''un devis émis : visible du client');
select set_config('storage.allow_delete_query', 'true', true);
select is(tests.affected(format($$ delete from storage.objects where bucket_id = 'logos' and name = %L $$, :'wa' || '/banner-1.png')), 0,
  'bannière d''un document émis : non supprimable');
select is(tests.affected(format($$ update storage.objects set metadata = '{}' where bucket_id = 'logos' and name = %L $$, :'wa' || '/banner-1.png')), 0,
  'bannière d''un document émis : non remplaçable');

-- Page publique : anon lit la bannière d'un document émis, rien d'autre.
select lives_ok(format($$ insert into storage.objects (bucket_id, name) values ('logos', %L) $$, :'wa' || '/banner-2.png'),
  'seconde bannière jamais envoyée');
select tests.as_anon();
select is((select array_agg(name) from storage.objects where bucket_id = 'logos' and created_at >= now()), array[:'wa' || '/banner-1.png'],
  'anon ne voit que la bannière d''un document émis');
select throws_ok($$ select id from public.quotes $$, '42501', null, 'aucune lecture directe des devis par anon');
reset role;
select is(
  (select public.get_public_quote(q.public_token) #>> '{freelancer,brand,primary_color}' from public.quotes q where q.id = :'q'),
  '#5B2B5E',
  'la page publique reçoit la marque figée');

select * from finish();
rollback;
