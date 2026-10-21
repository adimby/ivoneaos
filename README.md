# Ivonea OS

Le bureau du freelance malgache : CRM, devis, factures et paiement mobile money (Papi), puis Whop pour les clients étrangers.

Conception : [Ivonea OS : conception](https://claude.ai/code/artifact/96b84522-b7e9-4a6e-9f19-eb76f431f0a5).

## Stack

- Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4
- Supabase (Postgres, RLS, Auth, Storage) via `@supabase/ssr`
- `next-intl` : français (par défaut) et anglais, routes `/fr` et `/en`
- Vitest pour la logique métier, Playwright pour les parcours de bout en bout
- zod pour valider les entrées des actions serveur

## Démarrer

Prérequis : Node 22, Docker (pour Supabase en local).

```bash
npm install
npx supabase start            # Postgres, Auth, Storage, Mailpit en local ; applique les migrations
npx supabase status           # URL et clés à copier dans .env.local
cp .env.example .env.local    # renseigner les valeurs (jamais committées)
npm run dev
```

Les e-mails d'Auth (codes OTP) arrivent dans Mailpit : http://127.0.0.1:54324.

Connexion par code à 6 chiffres (OTP Supabase, sans lien magique) : les modèles d'e-mail
`supabase/templates/*.html` affichent `{{ .Token }}` (déclarés dans `supabase/config.toml` ;
après les avoir modifiés, `npx supabase stop && npx supabase start`). En production, reprendre
ces modèles dans le tableau de bord Supabase (Auth > Email Templates, « Magic Link » et
« Confirm signup »).

## Base de données

- Schéma, RLS, fonctions et Storage : `supabase/migrations/`. Réappliquer depuis zéro : `npx supabase db reset`.
- Tests pgTAP : `supabase/tests/` (`npm run test:db`).
- Numérotation et limites à deux sessions réelles (psql requis) : `npm run test:db:concurrency`.
- Après une migration, régénérer les types : `npm run db:types` (la CI vérifie qu'ils sont à jour).
- Règles clés : tout appartient à un workspace (RLS via `my_workspace_ids()`, `is_member` pour
  l'application), anon n'accède à aucune table
  (seulement `get_public_quote`, `get_public_invoice`, `accept_quote`, et `is_public_logo` pour la
  politique du bucket `logos`), numéros D-/F-AAAA-NNNN
  sans trou attribués à l'émission, document émis figé, secrets de paiement illisibles
  par le navigateur (lister les colonnes de `payment_accounts` et `payment_links`, `select('*')` est refusé).
- Un devis ou une facture naît brouillon, reçoit ses lignes, puis est émis par `update … status = 'sent'`.
  `amount_paid`, `paid_at` et le statut « payée » découlent des paiements ; le navigateur n'enregistre
  que des paiements manuels (`provider = 'manual'`, `method` parmi `manual`, `MVOLA`, `ORANGE_MONEY`,
  `AIRTEL_MONEY`) ; Papi et Whop : serveur, clé secrète, après vérification du webhook.
- « Marquer payée » = insérer un paiement manuel du reste dû (`total − amount_paid`) ; la facture
  passe seule à « payée ». Un paiement manuel ne dépasse jamais le reste dû (`payment_exceeds_balance`)
  et n'est pas daté de plus d'un jour dans le futur (`payment_date_in_future`), ni de plus d'un jour
  avant l'envoi de la facture (`payment_date_before_invoice`). Un paiement Papi / Whop
  (argent réellement reçu) est toujours enregistré, même en trop-perçu ou sur une facture annulée
  (elle reste annulée, `amount_paid` est à jour). Annuler une facture annule ses liens de paiement actifs. `overdue` n'est accepté que si `due_on` est passée (heure d'Antananarivo).
- Devis envoyé : reste modifiable jusqu'à l'acceptation (jamais vidé). Après une modification,
  l'interface doit le signaler, régénérer le PDF et proposer de renvoyer le lien. Le client accepte
  avec `accept_quote(token, version)` : `version` vient de `get_public_quote`, chaîne opaque à renvoyer
  telle quelle (ne pas la convertir) ; `'outdated'` = le devis a changé, recharger. Accepté (par le
  client ou la freelance), le devis fait passer l'opportunité liée à l'étape « gagné ». Un devis dont
  `valid_until` est passée ne s'envoie pas, ni ne se renvoie après expiration (`quote_valid_until_past`).
- Quantités des lignes : 2 décimales au plus, refusé sinon (`quantity_too_precise`), jamais arrondi
  en silence ; l'interface limite aussi la saisie.
- PDF : `pdf_path` libre sur un brouillon et un devis envoyé, posé une seule fois sur une facture émise
  ou un devis accepté. Le bucket `documents` n'accepte que des ajouts : un nom de fichier nouveau à
  chaque génération (par exemple `<workspace_id>/quotes/<id>-<version>.pdf`).
- Devises : `invoices.exchange_rate` = unités de la devise par défaut pour 1 unité majeure de la devise
  de la facture (1 EUR = 5000 MGA → 5000), conversion avec `convertMinor` (`src/lib/money.ts`).
  `workspaces.default_currency` est figée dès la première facture émise.
- `workspaces.profile_completed_at` (garantie 90 jours) : posé par la base quand nom, métier, NIF,
  STAT et régime fiscal sont remplis ; jamais saisi ni effacé.
- Offres : `workspaces.plan` (`decouverte` par défaut, `lancement`, `premier_client`, `contrat_signe`),
  changée par le serveur seulement. Découverte : 3 devis + factures envoyés par mois calendaire (heure
  d'Antananarivo, comptés à la sortie du brouillon, `free_limit_reached`) et 20 contacts actifs
  (`contact_limit_reached`), contrôlés en base sous un verrou du workspace (pas de dépassement par
  deux requêtes simultanées). Mêmes valeurs à reprendre dans les constantes de `canUse`.
- Storage : buckets `logos` et `documents` privés ; écriture dans le dossier `<workspace_id>/`
  uniquement ; ajouts seulement (jamais de remplacement) : un nom nouveau à chaque envoi
  (`<workspace_id>/logo-<version>.<ext>`, 1 Mo au plus) ; un ancien logo ne se supprime que s'il ne
  figure sur aucun document émis ; PDF jamais supprimés par le navigateur. La page publique affiche le
  logo par une URL signée créée avec la clé publique (`createSignedUrl`) : anon ne lit que le logo
  figurant dans la copie figée d'un document émis (`is_public_logo`).
- Suppression d'un compte (`auth.users`, côté serveur) : quand son dernier propriétaire disparaît, le
  workspace est supprimé avec toutes ses données, factures émises comprises. Proposer l'export des
  factures avant de supprimer un compte.
- `profiles` : le navigateur ne modifie que `full_name`, `phone` et `locale` (`created_at` = date
  d'inscription, base de la garantie 90 jours).
- Erreurs métier : code `55000` et un message-clé (`document_frozen`, `free_limit_reached`…, liste
  en tête de `supabase/migrations/…_billing.sql`), traduit dans `errors.db.*` de `messages/*.json`
  (un test Vitest vérifie que chaque clé levée est traduite). Étapes du pipeline : `pipeline.stages.*`.
- Toute nouvelle fonction SQL : `revoke execute … from public, anon` puis accorder ce qu'il faut.
- Tableau de bord : `dashboard_invoice_totals` (encaissé du mois, en attente, en retard) et `plan_usage`
  (usage de l'offre), en `security invoker` (RLS de la freelance). Totaux par devise et taux ;
  conversion en devise par défaut dans `src/modules/dashboard/summary.ts`, jamais d'addition de
  devises sans taux (montant listé à part).
- Indicateurs de la garantie : vues `guarantee_workspaces` et `guarantee_weekly`, lisibles par la clé
  secrète seulement (`select * from guarantee_weekly` dans le SQL editor de Supabase).
- Whop (factures EUR/USD, si `WHOP_API_KEY`) : Réglages > Moyens de paiement crée le compte connecté
  et ouvre l'inscription Whop ; à l'envoi d'une facture EUR/USD, paiement unique créé sur ce compte
  (commission `WHOP_PLATFORM_FEE_PERCENT`), bouton « Payer par carte » sur la page publique. Webhook
  de la plateforme à créer chez Whop : URL `<APP_URL>/api/whop/webhook`, événement `payment.succeeded`,
  événements des comptes connectés activés (`child_resource_events`), secret dans
  `WHOP_WEBHOOK_SECRET` (sans lui, Whop reste masqué). Paiement enregistré par `record_whop_payment`
  (clé secrète seulement), d'après le montant présenté au client (`presentment_total`, devise de la
  facture), même si la freelance règle ses ventes dans une autre devise. Facture réglée à la main,
  annulée ou reste dû changé : le paiement Whop ouvert est annulé ici et supprimé chez Whop
  (`DELETE /checkout_configurations/{id}`). Paiement Whop authentique non enregistré (montant ou devise
  différents, autre compte, autre lien, montant illisible) : signalé sur la facture quand le lien est
  retrouvé (`flag_whop_link`), sinon journalisé (`[whop] paiement … non enregistré` dans les journaux Vercel).
- Réglages > Offre : `IVONEA_CONTACT_EMAIL` (adresse d'Ivonea pour changer d'offre) est obligatoire en
  production : `next build` échoue sur Vercel (`VERCEL_ENV=production`) sans elle.

## Mise en service de Whop (avant de l'ouvrir aux freelances)

Le code suit la doc et le SDK officiel (`@whop/sdk` 2.5.0) et a été testé contre un Whop simulé
(`e2e/whop-mock.mjs`), jamais contre la vraie API (pas de clé). Avant de renseigner `WHOP_API_KEY` en
production, faire un essai de bout en bout sur le bac à sable (`WHOP_API_BASE_URL=https://sandbox-api.whop.com/api/v1`,
clé et webhook du bac à sable, app en préproduction) :

1. Réglages > Moyens de paiement > « Connecter Whop » : compte connecté créé, inscription terminée,
   statut « Whop connecté ».
2. Facture EUR envoyée : la configuration `ch_…` est créée sans `plan_mismatch` dans les journaux (devise,
   prix et `adaptive_pricing_enabled` renvoyés identiques à la demande).
   Commission (`WHOP_PLATFORM_FEE_PERCENT` > 0) : elle est envoyée dans `plan.application_fee_amount`
   (doc Whop ; champ absent des types du SDK 2.5.0) et le lien est refusé (`plan_mismatch`) si la réponse ne
   la renvoie pas à l'identique dans `plan.application_fee_amount`. Vérifier que la commission apparaît
   chez Whop sur le paiement de test ; si Whop la prélève sans la renvoyer, ou l'ignore, adapter
   `whop.createLink` (`src/modules/payments/whop/adapter.ts`) à ce que l'API fait réellement avant de
   mettre une commission en production.
3. Paiement par carte de test : `webhook_events` contient l'événement, `error` vide, facture payée. Comparer
   le corps reçu (`raw_body`) aux champs lus par `parseWhopPayment` (`account_id`, `checkout_configuration_id`,
   `metadata.ivonea_reference`, `presentment_total`) ; corriger le code si la forme diffère.
   Taxes : `presentment_total` ne doit pas inclure de TVA ou taxe ajoutée par Whop au prix de la facture,
   sinon le paiement est refusé en `amount_mismatch` ; si Whop en ajoute, régler la taxe du plan
   (`override_tax_type`, SDK) ou du compte pour qu'elle soit incluse dans le prix, puis refaire l'essai.
4. Recommencer avec un compte connecté réglé dans une autre devise (`preferred_settlement_currency`).
5. Paiement manuel d'une facture dont le lien carte est ouvert : le lien Whop ne doit plus être payable.

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:db   # Supabase local démarré
npm run test:e2e  # Supabase local démarré, .env.local renseigné
```

Tests de bout en bout (`e2e/`, Playwright, Chromium) : chaque parcours de la spec devient un test,
sur un écran de 360 × 780 (P1 à P5, enchaînement complet du devis au tableau de bord, limites de
l'offre Découverte, anglais, accessibilité WCAG AA avec axe-core). `npm run test:e2e` construit
l'application (`npm run build`, dans `.next`) puis la lance sur le port 3100 (`E2E_PORT` pour un
autre), et une seconde fois sur le port 3101 avec Whop activé. Services simulés lancés par
`playwright.config.ts` : Papi (`e2e/papi-mock.mjs`), Whop (`e2e/whop-mock.mjs`) et Resend
(`e2e/resend-mock.mjs`, qui remet les e-mails de l'application à Mailpit). Aucun serveur déjà lancé
n'est réutilisé : si un port est pris, la suite s'arrête avec une erreur. Ne pas lancer deux
constructions en même temps dans le même dossier (`npm run build`, `npm run test:e2e`) : elles
partagent `.next`. Les codes de connexion et les e-mails sont lus dans l'API de Mailpit
(`MAILPIT_URL`, par défaut http://127.0.0.1:54324). `.env.local` doit contenir les clés de la pile
locale, `PAYMENT_SECRETS_KEY` et `CRON_SECRET`, sans `APP_URL` (les liens attendus pointent vers
127.0.0.1). Navigateur : `npx playwright install chromium` la première fois (ou
`PLAYWRIGHT_BROWSERS_PATH` vers un Chromium déjà installé).

Deux suites en même temps sur la même machine (deux personnes, ou une personne et un agent) : chacune
dans sa propre copie du dépôt (`.next` séparé, `node_modules` copié et non lié : Turbopack ne suit pas
un lien symbolique), et avec ses propres ports, en changeant ensemble les 5 variables `E2E_PORT`
(défaut 3100), `E2E_WHOP_PORT` (3101), `PAPI_MOCK_PORT` (3199), `WHOP_MOCK_PORT` (3198) et
`RESEND_MOCK_PORT` (3197), par exemple
`E2E_PORT=4100 E2E_WHOP_PORT=4101 PAPI_MOCK_PORT=4199 WHOP_MOCK_PORT=4198 RESEND_MOCK_PORT=4197 npm run test:e2e`.
Les deux suites peuvent partager la pile Supabase locale (comptes et IP propres à chaque lancement),
mais aucune ne doit lancer `supabase db reset` pendant que l'autre tourne.

CI (`.github/workflows/ci.yml`) : `checks` (lint, types, Vitest, construction), `database` (pgTAP,
numérotation concurrente, types à jour) et `e2e` (pile Supabase locale, `.env.local` généré depuis
`supabase status -o env`, Playwright ; rapport et traces en artefact en cas d'échec).

## Mise en production

À vérifier sur la vraie infrastructure (impossible à prouver en local ou en CI) :

- [ ] **Variables Vercel** (Production) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SECRET_KEY` (aussi utilisée par les limites de la connexion), `PAYMENT_SECRETS_KEY`
  (`openssl rand -base64 32`, gardée hors du dépôt et sauvegardée : la perdre rend illisibles toutes
  les clés Papi), `CRON_SECRET`, `APP_URL` (domaine public en `https://` : liens envoyés aux clients,
  retours Papi et Whop), `IVONEA_CONTACT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`. Jamais
  `PAPI_API_BASE_URL`, `WHOP_API_BASE_URL` ni `RESEND_API_BASE_URL` (tests seulement). La construction
  de production (`VERCEL_ENV=production`) échoue si `APP_URL` ou `IVONEA_CONTACT_EMAIL` manque ou si
  une URL de test est renseignée (`src/lib/production-env.ts`). Sur un déploiement Vercel de
  préproduction sans `APP_URL`, l'hôte vient de `X-Forwarded-Host`, posé par la plateforme.
  **Hors de Vercel** (auto-hébergement, préproduction avec `next start`), `APP_URL` est
  indispensable : sans elle, les liens envoyés aux clients et les adresses de retour et de
  notification enregistrées chez Papi et Whop prennent l'hôte envoyé par le client
  (`X-Forwarded-Host`, sinon `Host`), qu'un attaquant choisit. Le serveur l'écrit au démarrage
  (« APP_URL absente en production hors de Vercel ») mais démarre quand même (les tests de bout en
  bout en dépendent). De même, hors de Vercel, l'IP client des limites de connexion vient de
  `X-Forwarded-For`, que le client fixe lui-même : le proxy placé devant l'application doit écraser
  cet en-tête (pas le compléter), sinon la limite par IP se contourne et seules les limites par
  adresse e-mail protègent le code.
- [ ] **Supabase hébergé** : migrations appliquées (`supabase db push`), `npm run test:db` vert sur une
  branche de préproduction, réglages Auth ci-dessous (SMTP, modèles, limites, URL du site).
- [ ] **Resend** : domaine d'envoi vérifié (SPF, DKIM, DMARC) pour l'adresse de `EMAIL_FROM` ; envoyer un
  devis par e-mail à une adresse Gmail et une adresse Yahoo : reçu hors spam, nom
  « <Studio> via Ivonea OS », réponse adressée à la freelance.
- [ ] **Cron Vercel** (`vercel.json`) : les deux tâches apparaissent dans Settings > Cron Jobs ; un
  rappel du jour programmé la veille arrive à 08:00 (heure d'Antananarivo) ; `/api/cron/papi` répond 200.
- [ ] **Papi réel** (pas de bac à sable) : avec une vraie boutique, connecter la clé (« Papi connecté »),
  envoyer une facture de 300 Ar à soi-même, payer par MVola, vérifier la notification
  (`webhook_events.signature_valid = true`, facture payée, montant et frais), puis un lien expiré
  recréé, et le rattrapage du cron sur un paiement dont la notification est perdue. Revérifier les noms
  de champs avec la doc Papi du moment.
- [ ] **Whop** : suivre « Mise en service de Whop » ci-dessus sur le bac à sable avant de renseigner
  `WHOP_API_KEY` et `WHOP_WEBHOOK_SECRET` en production.
- [ ] **En-têtes** : sur le domaine de production, la page publique d'un document renvoie
  `Content-Security-Policy` (avec `frame-ancestors 'none'`), `Strict-Transport-Security`,
  `X-Content-Type-Options` et `Referrer-Policy` ; le logo s'affiche (Storage autorisé par `img-src`) ;
  le PDF s'ouvre dans le lecteur du téléphone (Android Chrome, iOS Safari).
- [ ] **Limites de débit** : pare-feu Vercel (Firewall > Rate limiting, par IP, action « Deny »
  pendant 5 min). Ces trois règles demandent l'offre Vercel **Pro** (40 règles de limite de débit par
  projet ; l'offre Hobby n'en a qu'une, à mettre alors sur `POST /*/connexion`). Sans elles, rien ne
  limite les pages publiques ni les webhooks dans l'application : passer en Pro, ou mettre le domaine
  derrière Cloudflare avec des règles équivalentes, ou ajouter un compteur applicatif sur le modèle
  de `public.auth_attempts`. Règles : `POST /*/connexion` à 10 requêtes par minute (une connexion = 2 requêtes, en plus
  des limites de l'application) ; `/*/p/*` (pages publiques, une requête base par visite) à 60 par
  minute ; `/api/papi/notification` et `/api/whop/webhook` à 120 par minute. Limites Auth Supabase
  ci-dessous. Les jetons publics (32 caractères aléatoires) ne se devinent pas, ces limites protègent
  la base, pas les documents. Vérifier qu'au-delà de 5 codes faux pour une même adresse depuis un
  même téléphone, la page de connexion affiche « Trop de tentatives » (compteurs
  `public.auth_attempts`, IP réelle lue dans `x-real-ip`).
- [ ] **Limites de connexion et réseaux mobiles** : à Madagascar, les opérateurs mobiles placent de
  nombreux abonnés derrière les mêmes IP publiques (CGNAT), et un Wi-Fi de formation ou de démo
  partage une seule IP. Au-delà de 20 envois de code (ou 20 vérifications) par quart d'heure depuis
  une même IP, des personnes qui n'ont rien fait de mal voient « Trop de tentatives ». Surveiller
  les refus (lignes en rafale dans `public.auth_attempts` pour une même clé `ip`) ; avant une
  formation ou une démo de groupe, relever `AUTH_LIMITS.send.ip` et `AUTH_LIMITS.verify.ip`
  (`src/modules/auth/rate-limit.ts`) **et** les plafonds Supabase en même temps (calcul dans
  « Mise en production de la connexion »), sans jamais dépasser ces derniers.
- [ ] **Risque résiduel accepté : scripts en ligne.** La politique de contenu garde
  `script-src 'unsafe-inline'` (pas de nonce, à cause des pages statiques et de Cache Components) :
  elle ne bloque pas un script injecté dans la page. La protection contre le XSS repose sur React
  (aucun `dangerouslySetInnerHTML` avec une donnée saisie) ; la politique limite seulement où les
  données peuvent partir (`connect-src 'self'`, `form-action` vers le site et Whop) et interdit
  l'affichage dans un cadre.
- [ ] **Téléphone réel** : parcours P1 à P5 sur un Android d'entrée de gamme en 3G (DevTools ne remplace
  pas un vrai réseau malgache), dont l'ouverture du lien WhatsApp et le paiement Papi.
- [ ] **Sauvegardes** : Point-in-time recovery ou sauvegardes quotidiennes activées sur Supabase (factures
  émises jamais supprimées).

Après le MVP (sécurité) : politique de contenu avec nonce (`script-src 'nonce-…'` posé par
`src/proxy.ts`) à la place de `'unsafe-inline'`, ce qui rend les pages dynamiques ; à peser contre le
cache des pages publiques, en commençant par les pages dynamiques sensibles (connexion, réglages).
`form-action` (site et Whop, pour l'inscription redirigée) et `frame-ancestors 'none'` sont déjà en
place.

## Mise en production de la connexion (Supabase Auth)

La connexion par code (P1) dépend de réglages du projet Supabase hébergé, à faire avant d'ouvrir
l'inscription (tableau de bord Supabase, Authentication) :

- **SMTP personnalisé** (Resend : `smtp.resend.com`, domaine d'envoi vérifié). Le service d'e-mail
  intégré de Supabase n'envoie qu'aux adresses des membres de l'équipe du projet, avec une limite de
  quelques e-mails par heure : sans SMTP personnalisé, personne d'autre ne reçoit son code.
- **Modèles d'e-mail** « Magic Link » et « Confirm signup » : reprendre `supabase/templates/*.html`
  et le sujet de `supabase/config.toml` (ils affichent le code `{{ .Token }}`, pas de lien).
  Longueur du code (Email OTP Length) : 6.
- **Limites** (Rate Limits). `signInWithOtp` et `verifyOtp` sont appelés par le serveur Next
  (actions serveur) : Supabase compte les demandes par adresse IP du serveur, et toutes les
  utilisatrices partagent les IP de sortie de Vercel. Ses limites sont donc un plafond **global**,
  que les limites de l'application (`src/modules/auth/rate-limit.ts`, par quart d'heure) doivent
  empêcher une seule IP d'atteindre :
  - par IP client : 20 envois de code et 20 vérifications (au plus 20 en 5 min) ;
  - par adresse e-mail et IP : 5 envois et 5 vérifications ;
  - par adresse e-mail, toutes IP confondues : 15 envois et 10 vérifications (un code à 6 chiffres
    ne se force pas ; la boîte de la personne visée ne reçoit pas plus de 15 codes).

  Régler chaque plafond Supabase à **au moins 20 × le nombre d'IP qu'on accepte de voir abuser en
  même temps + le pic de trafic normal**, soit pour démarrer : « Sign-ups and sign-ins » et « Token
  verifications » à 150 par 5 min (6 IP abusives + 30 connexions normales), et la limite d'envoi
  d'e-mails (« Emails sent », par heure, réglable une fois le SMTP personnalisé en place) à 600 par
  heure (une IP peut demander 80 codes par heure). Au-delà de 6 IP, c'est le pare-feu Vercel (10
  requêtes par minute et par IP sur `POST /*/connexion`) puis un captcha qui protègent.

  Compromis connu : les compteurs par adresse e-mail ne dépendent pas de la personne qui demande.
  Quelqu'un qui connaît l'adresse d'une freelance peut bloquer sa connexion un quart d'heure, avec
  2 IP (10 codes faux) ou 3 IP (15 envois), et recommencer. Une IP seule ne le peut plus (5 essais
  par adresse et par IP), un envoi refusé par Supabase n'est pas compté contre l'adresse, et une
  session ouverte n'est pas touchée (seule une nouvelle connexion est bloquée). Ce blocage protège le
  code : le supprimer permettrait d'essayer les codes depuis beaucoup d'IP. Si ces abus apparaissent
  (lignes en rafale dans `public.auth_attempts`), ajouter un captcha Turnstile (Supabase Auth >
  Attack Protection, `captchaToken` passé à `signInWithOtp`) à l'étape e-mail.

  Les clés de `public.auth_attempts` sont des empreintes HMAC-SHA256 (clé `SUPABASE_SECRET_KEY`) :
  ni adresse e-mail ni IP en clair dans la base, lignes effacées après une journée.
- **URL du site** (Site URL) : l'adresse de production, pour les e-mails.

## Organisation

```
src/app/[locale]/             page d'accueil, connexion, demarrage (accueil guidé)
src/app/[locale]/(app)/       écrans connectés : coquille (en-tête, onglets), garde d'accès
src/components/ui/            primitives (Button, Input, Select, Field, Card, Badge, Alert)
src/modules/auth/             connexion par code, déconnexion, langue
src/modules/onboarding/       diagnostic, niveau, liste de démarrage
src/modules/workspace/        profil pro, logo, coordonnées de paiement direct
src/modules/crm|billing|payments/  requêtes exposées aux autres modules
src/i18n/                     routage et chargement des traductions
src/lib/                      supabase, money, session, formulaires, erreurs de la base
src/proxy.ts                  langue, session Supabase, redirection vers la connexion
messages/                     textes fr.json et en.json (tutoiement)
supabase/migrations/, supabase/tests/, supabase/templates/
e2e/                          parcours Playwright
```

Thème « Océan » : variables `@theme` de `src/app/globals.css` (`bg-lagoon`, `bg-terracotta`,
`text-ink`, `bg-sand-light`…), contrastes vérifiés en tête du fichier. Accès : toute page sous
`(app)` exige une session (proxy, puis `requireWorkspace` côté serveur) et l'accueil guidé terminé
(`workspaces.profile_completed_at`) ; toutes les lectures et écritures passent par le client
Supabase de l'utilisatrice (RLS), jamais par la clé secrète.
