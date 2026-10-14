# Ivonea OS

Le bureau du freelance malgache : CRM, devis, factures et paiement mobile money (Papi), puis Whop pour les clients étrangers.

Conception : [Ivonea OS : conception](https://claude.ai/code/artifact/96b84522-b7e9-4a6e-9f19-eb76f431f0a5).

## Stack

- Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4
- Supabase (Postgres, RLS, Auth, Storage) via `@supabase/ssr`
- `next-intl` : français (par défaut) et anglais, routes `/fr` et `/en`
- Vitest pour la logique métier

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
  et n'est pas daté de plus d'un jour dans le futur (`payment_date_in_future`). Un paiement Papi / Whop
  (argent réellement reçu) est toujours enregistré, même en trop-perçu. `overdue` n'est accepté que si `due_on` est passée (heure d'Antananarivo).
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
  uniquement ; PDF sans remplacement ni suppression par le navigateur. La page publique affiche le
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

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:db   # Supabase local démarré
```

## Organisation

```
src/app/[locale]/   pages (fr, en)
src/i18n/           routage et chargement des traductions
src/lib/            supabase (clients serveur et navigateur), money (montants et devises)
src/proxy.ts        langue + rafraîchissement de la session Supabase
messages/           textes fr.json et en.json
supabase/migrations/
```
