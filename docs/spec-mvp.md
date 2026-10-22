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
- Interface en français (défaut) ou anglais, séparateur de milliers = espace. Usage principal sur ordinateur
  (navigation à gauche, listes en colonnes, pipeline en kanban, fiches en deux colonnes) ; téléphone parfait
  (360 px, une main, barre d'onglets et action principale en bas) ; tablette entre les deux (contenu élargi,
  onglets en bas). Mise en page en CSS seulement (Tailwind md / lg / xl, requêtes de conteneur
  quand un bloc dépend de sa place réelle) ; petit portable (1024 px) : kanban en 3 × 2, listes de devis et factures en cartes.
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
   nécessaires pour facturer ; une fois complets, ils se corrigent mais ne s'effacent plus (règle en base, comme les
   formats : NIF 10 chiffres, STAT 17 chiffres). Les 3 premières factures partent sans contrôle de la carte fiscale ;
   la 4e attend qu'elle soit vérifiée (voir « Vérification fiscale »).
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
| fiscal_verifications | workspace_id, nif, stat (au dépôt), front_path, back_path (vidés à la décision), status (pending, verified, rejected, cancelled), method (automatic, manual), decided_by, decided_at, rejection_reason |
| platform_admins | user_id |

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

## Personnalisation
Offerte sur toutes les offres (aucune limite).

**Apparence de l'application** (Réglages > Apparence), propre à chaque personne (`profiles.theme_mode`,
`profiles.theme_palette`) :
- Mode Clair (défaut, l'aspect d'origine), Sombre ou Automatique (suit le réglage du téléphone ou de l'ordinateur).
- Couleur principale parmi 6 palettes vérifiées : Océan (défaut, palette de marque ci-dessous), Forêt, Prune, Corail,
  Ardoise, Sable. Pas de couleur libre pour l'application (contraste). Chaque palette définit tous les jetons de
  `globals.css` en clair et en sombre (`src/modules/appearance/themes.ts`, seule source ; `src/app/themes.css` en est
  généré par `npm run themes:css`) ; un test calcule le contraste AA de chaque couple texte / fond pour chaque
  palette × mode. Jetons de rôle : `surface` (cartes, champs), `chrome` (navigation, en-têtes), `on-*` (texte posé
  sur l'aplat du même nom) ; plus de `bg-white` / `text-white` dans les écrans.
- Affichage sans éclair : le choix est recopié dans un cookie `ivn_apparence` (à l'enregistrement et à la connexion) ;
  un court script en tête de `<html>` pose `data-mode` / `data-palette` et la couleur `theme-color` avant la
  première peinture. Lire le cookie côté serveur rendrait toute l'application dynamique (plus de coquille statique,
  Cache Components) : choix écarté. Sans JavaScript, une feuille `/apparence.css` (dans `<noscript>`) applique la
  palette. Profil et cookie divergents (autre appareil) : la page connectée réaligne le cookie. Écart assumé avec
  « appliqué côté serveur sur `<html>` » : le HTML serveur ne porte pas `data-mode`, le test E2E vérifie les
  attributs dès la première image (script), pas dans le HTML serveur.
- Apparence appliquée seulement une fois enregistrée (un échec garde l'apparence du profil). Navigations sans
  rechargement (connexion, déconnexion, accueil guidé) : l'apparence est relue depuis le cookie. La déconnexion
  efface le cookie : sur un appareil partagé, l'écran de connexion revient à Océan clair.
- `theme-color` : suit la palette et, en mode Automatique, le changement de mode du système. Sans JavaScript, elle
  reste celle d'Océan clair (variante sombre selon le système écartée : elle se tromperait pour le cas le plus
  courant, le mode Clair par défaut).
- Les pages publiques (`/p/…`) et les PDF ne suivent jamais le thème de la freelance : ils suivent son image de marque.

**Image de marque des devis et factures** (Réglages > Image de marque), au niveau du workspace (colonnes `brand_*`,
plus `invoice_footer` devenu « Pied de page des documents ») ; appliquée au PDF et à la page client, avec un aperçu
en direct et un PDF d'exemple dans Réglages :
- Logo affiché ou non, petit / moyen / grand, à gauche ou centré.
- Bannière d'en-tête facultative : PNG ou JPEG (le moteur PDF ne lit pas le WebP), 1 Mo, format conseillé
  1600 × 400 px (4:1), toute la largeur en haut du document. Même stockage que le logo (bucket privé `logos`, dossier
  du workspace, ajouts seulement, type reconnu à ses premiers octets) ; visible sans session seulement si elle figure
  dans un document émis (`is_public_logo`), jamais supprimée tant qu'un document émis l'affiche.
- Couleur principale (titres, en-tête du tableau, total) et d'accent (reste à payer, bouton du client, détails) au
  nuancier ou en `#RRVVBB`, avec 6 associations prêtes. La principale sert de texte sur fond clair : refusée si son
  contraste est sous 4,5:1 sur blanc, sable clair ou fond de page (message clair, contrôle navigateur et serveur).
  Sur les aplats des deux couleurs, le texte passe automatiquement en blanc ou en noir (toujours ≥ 4,5:1). L'accent
  reste libre (or, corail : sous 3:1 sur fond clair, mais au cœur de nombreuses marques) ; s'il est trop pâle
  (< 3:1), le bouton du client et l'aplat « Reste à payer » du PDF reçoivent un contour à la couleur principale
  (WCAG 1.4.11).
- Police parmi 5, sous licence SIL OFL, embarquées dans le PDF et servies par le site en WOFF2 (aucune police
  téléchargée à l'exécution, aucun CDN) : Liberation Sans (Classique), Montserrat (Moderne), Nunito (Arrondie),
  Spectral (Élégante), Barlow Condensed (Condensée). Préparées par `scripts/build-brand-fonts.py` (sous-ensemble
  latin, n̈ malgache, € $, espace fine des montants) ; licences dans `src/modules/billing/fonts` et
  `public/fonts/brand`. « Liberation » étant un nom réservé (OFL), sa version web sous-ensemble s'appelle
  « Ivonea Classique » (même dessin) ; le PDF garde le TTF d'origine.
- Documents envoyés : l'image de marque entre dans la copie figée prise à l'émission (`snapshot.freelancer.brand`) ;
  le PDF et la page client d'un document envoyé gardent la marque de leur envoi, même si elle change ensuite. Les
  documents émis avant cette fonctionnalité gardent l'aspect Océan d'origine.

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
- Tous les plans : au plus 3 factures émises tant que la carte fiscale n'est pas vérifiée (« Vérification fiscale »).
  Quand les deux limites tombent ensemble, le message de la vérification passe en premier (il dit quoi faire).
Les limites sont vérifiées côté serveur (action serveur et, si possible, en base), pas seulement dans l'interface.
Le coaching n'est pas un module du MVP.

## Vérification fiscale
Le freelance prouve son NIF et son STAT par une photo de sa carte fiscale ; on ne garde jamais les images.
- États (`workspaces.fiscal_status`) : `unverified` (défaut, aussi pour les workspaces existants), `pending`,
  `verified` (avec `fiscal_status_at`), `rejected` (avec `fiscal_rejection_reason`). Colonnes non modifiables par le
  freelance (droits par colonne). Un changement de NIF ou de STAT remet l'état à `unverified` (trigger) et annule une
  demande en cours. `fiscal_verifications` garde la trace des décisions, sans les photos.
- Dépôt (Réglages ; sur une facture brouillon dont l'envoi est bloqué par le plafond, avec le bouton du bas qui y
  mène ; ailleurs sur les écrans de facture, seulement le compteur et un lien vers Réglages) : recto et verso, JPG, PNG
  ou WEBP, 10 Mo chacun, envoyés directement du navigateur dans le bucket privé `fiscal-documents/{workspace_id}/`.
  Seul l'ajout est permis au membre, et seulement tant que la carte est à déposer (non vérifiée ou refusée) ; ni
  lecture, ni remplacement, ni suppression. Les fichiers d'une demande décidée ou annulée sont supprimés ; les dépôts
  jamais soumis le sont après une heure (au dépôt suivant et par le passage quotidien du cron). Composant réutilisable
  `FileDrop` (`src/components/ui/file-drop.tsx`).
- Lecture : la route `POST /api/fiscal/verification` (même origine, session, workspace lu avec le client de la
  personne) contrôle les fichiers (type réel), crée la demande (`submit_fiscal_verification`, réservée au rôle serveur :
  pas de contournement par un appel direct), puis lit les deux faces par OCR (tesseract.js, modèle anglais livré avec
  l'application via `@tesseract.js-data/eng`, aucun CDN ; fichiers inclus dans la fonction Vercel par
  `outputFileTracingIncludes`). Chaque photo est d'abord redressée selon son EXIF, réduite à 2000 px et passée en gris
  (sharp) ; si les numéros ne concordent pas, elle est relue tournée de 90°, 180° et 270° tant que le délai le permet.
  Lecture synchrone (le freelance attend la réponse, 40 s au plus, `maxDuration` 60 s) ; le texte lu n'est ni stocké
  ni journalisé. Règle de concordance pure et testée (`src/modules/verification/match.ts`) :
  suites de chiffres par ligne, espaces et tirets ignorés, confusions courantes corrigées (O→0, I/l→1, S→5, B→8).
  NIF et STAT retrouvés : vérifiée automatiquement, photos supprimées. Sinon : en attente et e-mail aux admins (Resend,
  ou journal sans Resend), seulement si la demande est toujours en attente ; l'avis est noté
  (`admins_notified_at`). Si la fonction est arrêtée par la plateforme avant l'avis, le passage quotidien du cron
  (`/api/cron/reminders`) prévient les admins pour les demandes en attente depuis plus de 5 minutes sans avis.
- Limite connue de la lecture automatique : elle accepte toute image où figurent le NIF et le STAT saisis (une image
  de texte fabriquée passe aussi). Elle prouve la cohérence des numéros, pas l'authenticité de la carte. Pistes plus
  tard : exiger des mots de la carte (« CARTE FISCALE », « NIF », « STAT ») ou contrôler à la main un échantillon.
- Admins de la plateforme : table `platform_admins`, fonction `is_platform_admin()`. `/admin/verifications` (file,
  détail avec les photos par URL signées de 5 minutes, historique) répond 404 à tout autre compte ; entrée de
  navigation réservée. « Valider » ou « Refuser » (motif obligatoire, montré au freelance) : photos supprimées et
  e-mail au freelance dans sa langue (la page admin dit si l'e-mail est parti). Une demande déjà traitée ou annulée
  renvoie à la liste avec « Cette demande a déjà été traitée ». Les pages admin sont dans la coquille de l'app :
  l'admin doit avoir un compte avec un workspace prêt (démarrage terminé), sinon elle est renvoyée vers le démarrage.
  En production, ajouter l'admin à la main (SQL, rôle serveur) :
  `insert into public.platform_admins (user_id) select id from auth.users where email = '…';`
- Plafond : `next_document_number` refuse la 4e facture (`fiscal_verification_required`) tant que la carte n'est pas
  vérifiée, sous verrou de la ligne du workspace ; l'action serveur le vérifie aussi, avec un lien vers le dépôt
  (« Tu as atteint la limite de 3 factures sans carte vérifiée… », ou « en cours de vérification » si les photos sont
  déjà déposées) et le compteur « Encore N factures avant la vérification ». Les factures déjà émises comptent ; les devis ne sont pas
  concernés. Rien n'apparaît sur la facture ni sur la page du client.

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
