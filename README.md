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
sur un écran de 360 × 780. `npm run test:e2e` construit l'application (`npm run build`, dans `.next`)
puis la lance sur le port 3100 (`E2E_PORT` pour un autre). Aucun serveur déjà lancé n'est réutilisé :
si le port est pris, la suite s'arrête avec une erreur. Ne pas lancer deux constructions en même
temps dans le même dossier (`npm run build`, `npm run test:e2e`) : elles partagent `.next`. Les codes
de connexion sont lus dans l'API de Mailpit (`MAILPIT_URL`, par défaut http://127.0.0.1:54324).
Navigateur : `npx playwright install chromium` la première fois (ou `PLAYWRIGHT_BROWSERS_PATH` vers
un Chromium déjà installé). Pas encore en CI.

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
  (actions serveur) : Supabase compte alors les demandes par adresse IP du serveur, et toutes les
  utilisatrices partagent les IP de sortie de Vercel. Relever « Sign-ups and sign-ins » et « Token
  verifications » (30 par 5 min par défaut) selon le trafic attendu, et la limite d'envoi d'e-mails
  (par heure) une fois le SMTP en place. Si les abus deviennent un problème, ajouter un captcha
  (Turnstile) à l'étape e-mail plutôt que de baisser ces limites.
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
