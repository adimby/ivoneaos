# Ivonea OS : spécification du premier jalon (MVP)

Source : document « Ivonea OS : conception » validé par Ivonea le 14 octobre 2026
(https://claude.ai/code/artifact/96b84522-b7e9-4a6e-9f19-eb76f431f0a5).

**Promesse :** depuis son téléphone, un freelance malgache crée son compte, ajoute un client, envoie un devis,
le transforme en facture et se fait payer par MVola, Orange Money ou Airtel Money (via Papi).

Principes :
- Une seule app Next.js (App Router, Server Components, Server Actions), Supabase (Postgres + RLS, Auth, Storage).
- Papi est branché **par freelance** : chacun colle sa propre clé Papi, chiffrée côté serveur. Ivonea OS ne touche jamais l'argent.
- Montants en entiers `bigint` : ariary pour MGA, centimes pour EUR/USD. Jamais de flottants.
- PDF généré côté serveur (`@react-pdf/renderer`) et stocké.
- Interface en français (défaut) ou anglais, mobile d'abord (360 px, une main), séparateur de milliers = espace.
- Portfolio, assistant IA, prospection LinkedIn/Facebook, SMS : **V2, hors MVP**.

## Parcours (deviennent les tests E2E)

### P1. S'inscrire et démarrer (Lancer)
1. Inscription par e-mail avec code à usage unique (OTP Supabase). Choix de la langue fr/en.
2. Diagnostic en 4 questions : métier, ancienneté, nombre de clients actuels, objectif de revenu mensuel en ariary.
3. Le diagnostic place le freelance au niveau « Lancer » (0 client) ou « Remplir son agenda » (déjà des clients) et affiche une liste de démarrage adaptée.
4. Profil pro : nom commercial, métier, logo, adresse, devise par défaut. Enregistré, il ouvre l'application
   (`workspaces.onboarded_at`, posé par la base). **NIF, STAT et régime fiscal (TVA ou impôt synthétique) ne sont pas
   demandés ici** (une ligne le dit) : ils le sont **avant la première facture**, par un bloc « Avant ta première
   facture » affiché là où la facture se prépare (nouvelle facture, devis accepté à transformer, brouillon à envoyer).
   Ses trois champs (NIF 10 chiffres, STAT 17 chiffres, régime) s'enregistrent dans le profil sans perdre le brouillon,
   puis l'envoi redevient possible. La base refuse toujours d'émettre une facture sans eux. Les devis ne les exigent pas.
   Dans Réglages, ils restent facultatifs tant qu'ils ne sont pas tous remplis, avec une aide qui dit qu'ils sont
   nécessaires pour facturer ; une fois complets, ils se corrigent mais ne s'effacent plus.
5. Arrivée sur le tableau de bord avec la liste de démarrage : ajouter un premier contact, connecter Papi, créer un premier
   devis, compléter ses infos fiscales.

### P2. Connecter son compte Papi
1. Depuis la liste de démarrage ou les réglages : « Moyens de paiement ».
2. Guide : ouvrir un compte Papi (pièces, frais), où trouver sa clé (Boutiques > onglet Développeur) et son secret de signature.
3. Il colle clé + secret. Chiffrés, jamais réaffichés en clair.
4. Vérification par un appel de lecture : « Papi connecté » ou l'erreur en clair.
5. Sans Papi, la facture reste envoyable avec coordonnées manuelles (numéro MVola, RIB) ; statut changé à la main.

### P3. Suivre un prospect dans le pipeline
1. Contact en 3 champs minimum : nom, téléphone ou e-mail, entreprise facultative.
2. Opportunité liée au contact : titre, montant estimé, étape.
3. 6 étapes : prospect, contacté, appel, devis, gagné, perdu. Sur mobile, bouton « Étape suivante » au lieu du glisser-déposer.
4. Note / échange (appel, WhatsApp, e-mail, rendez-vous) dans l'historique du contact.

### P4. Programmer un rappel
1. Depuis un contact ou une opportunité : « Me rappeler » (demain, dans 3 jours, dans 1 semaine) ou une date.
2. Le rappel apparaît dans « Aujourd'hui » sur le tableau de bord.
3. Notification le jour J par e-mail (Resend) — et notification navigateur si acceptée (optionnel MVP).
4. Marquer fait ou repousser d'un geste.

### P5. Du devis au paiement
1. Devis depuis l'opportunité (client prérempli). Lignes (description, quantité, prix unitaire), devise (MGA/EUR/USD), remise, validité.
2. Aperçu, PDF. Envoi par lien court (WhatsApp), e-mail, ou téléchargement.
3. Page publique légère sans compte : le client voit le devis et clique « J'accepte ». Le freelance peut aussi le marquer accepté.
4. Devis accepté → bouton « Transformer en facture », numéro séquentiel sans trou (ex. F-2026-0001). L'opportunité passe à « gagné ».
5. À l'envoi d'une facture en ariary, création d'un lien Papi avec la clé du freelance. Le lien figure sur la page publique et le PDF pointe vers la page publique.
6. Le client paie sur Papi. Papi notifie Ivonea OS, qui vérifie la signature puis passe la facture à « payée ».
7. Le freelance voit « Facture F-2026-0001 payée : 450 000 Ar » et le tableau de bord se met à jour.

Papi n'encaisse qu'en MGA. Facture EUR/USD : coordonnées manuelles, et lien Whop si le freelance a connecté Whop.

### Tableau de bord
Un écran, 4 blocs : encaissé ce mois-ci, factures en attente (montant et nombre), opportunités ouvertes par étape,
rappels du jour. Montants convertis dans la devise par défaut au taux saisi sur la facture (`exchange_rate`).

## Écrans
Navigation en 3 onglets en bas : Accueil, Pipeline, Factures. Contacts et Réglages via « Plus ».
Un bouton principal par écran, en bas, à portée du pouce. Montants toujours suivis de la devise (Ar, €, $).
Page facture côté client : mention « Facturé avec Ivonea OS ».

## Modèle de données
Tout appartient à un `workspace` (1 workspace = 1 freelance au MVP). RLS : lecture/écriture seulement si
`is_member(workspace_id)`. `id uuid`, `created_at`, `updated_at` partout. Suppression douce (`archived_at`)
pour contacts et opportunités. Factures émises jamais supprimées.

| Table | Colonnes clés |
| --- | --- |
| profiles | user_id, full_name, phone, locale (fr, en) |
| workspaces | name, trade, level (lancer, remplir, grandir), default_currency, nif, stat, tax_regime (tva, impot_synthetique), address, logo_path, invoice_footer |
| workspace_members | workspace_id, user_id, role (owner, member) |
| onboarding_answers | workspace_id, answers jsonb, completed_at |
| contacts | kind (person, company), name, company_name, email, phone, country (code ISO 3166-1 alpha-2, tous les pays, liste vérifiée aussi par la base ; choix avec recherche, Madagascar puis les 5 pays les plus utilisés par le workspace en tête, complétés par France, La Réunion, Maurice), tags text[], archived_at |
| pipeline_stages | name, position, kind (open, won, lost) — 6 étapes créées avec le workspace |
| deals | contact_id, stage_id, title, amount, currency, expected_close_on, archived_at |
| activities | contact_id, deal_id, kind (note, call, whatsapp, email, meeting), body, occurred_at |
| reminders | contact_id, deal_id, title, due_at, done_at, notified_at |
| quotes | number, contact_id, deal_id, status (draft, sent, accepted, declined, expired), currency, valid_until, subtotal, discount, total, public_token, pdf_path |
| invoices | number, quote_id, contact_id, status (draft, sent, paid, overdue, cancelled), currency, exchange_rate, issued_on, due_on, total, amount_paid, public_token, pdf_path |
| document_lines | quote_id ou invoice_id, position, description, quantity numeric(10,2), unit_price, line_total |
| number_sequences | workspace_id, doc_type (quote, invoice), year, last_value |
| payment_accounts | provider (papi, whop, manual), status, encrypted_api_key, encrypted_signing_secret, external_account_id, manual_instructions, last_checked_at |
| payment_links | invoice_id, payment_account_id, provider, merchant_reference, provider_url, notification_token, status, expires_at |
| payments | invoice_id, payment_link_id, provider, method (MVOLA, ORANGE_MONEY, AIRTEL_MONEY, CARD, manual), amount, fee, currency, provider_reference (unique), paid_at |
| webhook_events | provider, payload jsonb, signature_valid, processed_at, error |

Sécurité et intégrité :
- Clés Papi chiffrées (AES-256-GCM côté serveur avec une clé `PAYMENT_SECRETS_KEY`, ou Vault). Colonnes chiffrées lisibles par le rôle serveur seulement, jamais par le navigateur, même pour leur propriétaire.
- Numéros : fonction SQL qui verrouille `number_sequences` (`SELECT … FOR UPDATE`) au passage brouillon → envoyé. Un brouillon n'a pas de numéro.
- Facture figée : une fois envoyée, lignes et total non modifiables (règle en base, trigger).
- Pages publiques via `public_token` aléatoire de 32 caractères, servies par le serveur (client service role), jamais d'accès anonyme direct aux tables.
- Paiement idempotent : `payments.provider_reference` unique.
- Fichiers : logos et PDF dans Supabase Storage, un dossier par `workspace_id`, même règle d'appartenance.
- `canUse(workspace, feature)` : voir « Offres et limites » ci-dessous.

## Architecture du code
```
src/
  app/[locale]/(app)/        écrans connectés : tableau-de-bord, contacts, pipeline, devis, factures, reglages
  app/[locale]/p/[token]/    pages publiques devis et facture
  app/api/papi/notification/
  app/api/cron/
  modules/
    crm/          contacts, opportunités, activités, rappels
    billing/      devis, factures, lignes, numérotation, PDF
    payments/     interface PaymentProvider + adaptateurs papi/ et whop/
    onboarding/   diagnostic, niveau, liste de démarrage
    dashboard/
  lib/            supabase, money, i18n
supabase/migrations/
```
Un module ne lit pas les tables d'un autre directement : il passe par les fonctions que l'autre expose.

## Intégration Papi (doc : https://docs.papi.mg/fr/docs/developper-guide/integration-guide)
1. `POST https://app.papi.mg/engine/api/payment-links`, en-tête `Token` = clé du freelance. Corps : `amount` (min 300 Ar),
   `clientName`, `reference`, `description`, `successUrl`, `failureUrl`, `notificationUrl`, `validDuration` (heures).
2. `reference` = `IVN-<invoice id>-<n° tentative>`. Papi est idempotent sur la référence.
3. Notification sur `/api/papi/notification`, une seule fois. Enregistrer d'abord le corps brut dans `webhook_events`,
   vérifier `X-Papi-Signature` avec le secret du freelance, puis `notificationToken` et `merchantPaymentReference`. Ensuite seulement : facture payée.
4. Rattrapage : cron qui relit `GET /engine/api/payment-links/{reference}` et applique `linkStatus` (`PAID`, `EXPIRED`…).
5. Lien expiré recréé à la demande quand le client rouvre la facture publique.
6. Vérification de clé : `GET` sur une référence inexistante → `401` = clé inconnue, `404` = clé valide.
7. Pas de bac à sable : tests automatiques avec réponses Papi simulées.
**Toujours revérifier les noms de champs exacts dans la doc Papi avant de coder.**

## Whop (factures EUR/USD)
Comptes connectés : Ivonea OS est une plateforme Whop, chaque freelance a son compte connecté.
Paiement unique créé sur le compte du freelance (`checkoutConfigurations.create` avec `account_id`,
`application_fee_amount`), lien sur la facture. Retrait via le portail payout Whop.
Doc : https://docs.whop.com/developer/platforms/collect-payments-for-connected-accounts.
Le compte plateforme Whop d'Ivonea OS n'existe pas encore : implémenter derrière une variable `WHOP_API_KEY`,
désactivé proprement (bouton masqué) quand elle est absente.

## Hors MVP
SMS (Mapi, V2), avoirs, abonnements payants, portfolio, prospection, projets/tâches, saisie hors ligne.

## Indicateurs de la garantie 90 jours (à pouvoir mesurer, sans module de coaching)
Le cadrage produit prévoit un accompagnement de 3 mois avec garantie. Le modèle de données doit permettre de calculer,
sans nouveau module : date d'inscription (`profiles.created_at`), profil terminé (`workspaces.profile_completed_at`,
posé quand NIF, STAT, régime fiscal, nom et métier sont remplis, donc au plus tard avant la première facture ; à ne pas
confondre avec `workspaces.onboarded_at`, fin de l'accueil guidé qui ouvre l'application), prospects contactés par semaine (activités de type
call, whatsapp, email ou meeting, par `occurred_at`), devis envoyés (`quotes.sent_at`, et `invoices.sent_at`).
Pas de suivi des séances de coaching ni de portfolio au MVP.

## Offres et limites (grille validée par Ivonea)
`workspaces.plan` : `decouverte` (défaut, gratuit), `lancement` (50 000 Ar/mois), `premier_client`, `contrat_signe`.
Pas de paiement d'abonnement au MVP : le plan se change à la main en base (rôle serveur), jamais par l'utilisateur.
`canUse(workspace, feature)` applique les limites, définies dans une seule table de constantes :
- Découverte : au plus 20 contacts actifs, au plus 3 devis + factures envoyés par mois calendaire (le compteur porte
  sur les documents qui quittent l'état brouillon). Au-delà, message clair et invitation à passer à Lancement.
- Lancement et au-dessus : illimité.
Les limites sont vérifiées côté serveur (action serveur et, si possible, en base), pas seulement dans l'interface.
Le coaching n'est pas un module du MVP.

## Palette de marque « Océan » (choisie par Ivonea)
À définir une fois comme variables de thème Tailwind 4 (`@theme` dans globals.css) et à utiliser partout :
- Deep Lagoon `#01515A` : titres, zones sombres (barre de navigation, en-têtes)
- Tropical Turquoise `#2E99AB` : accents, icônes, badges uniquement (pas de texte blanc dessus, contraste insuffisant)
- Terracotta `#A45C36` : bouton principal (texte blanc)
- Sea Spray White `#E8EDF0` : fond
- Shore Sand `#C9C5BA` : bordures
- Sable clair `#F4F1EA` : sections alternées, cartes
- Texte `#0B2A2E`
Vérifier le contraste AA de chaque couple texte/fond utilisé.
