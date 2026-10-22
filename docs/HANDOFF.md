# Ivonea OS : passation pour reprise du projet

État au 22 octobre 2026. Ce document permet à un nouvel agent (ou une nouvelle personne) de reprendre
le projet sans l'historique des conversations. Il ne contient aucun secret : les clés sont dans Vercel
et Supabase, jamais dans le dépôt.

À lire ensuite, dans cet ordre :
1. `CLAUDE.md` et `AGENTS.md` (règles de travail, Next.js 16 différent de ce que tu connais).
2. `docs/spec-mvp.md` (spécification validée : parcours, données, règles métier).
3. `README.md` (démarrage local, règles de la base, vérifications, check-list de mise en production).

---

## 1. Le projet en bref

**Ivonea OS** est « le bureau du freelance malgache » : CRM, pipeline, devis, factures et paiement
(mobile money via Papi, carte via Whop) pour les freelances à Madagascar (assistants virtuels,
graphistes, développeurs, rédacteurs, community managers…).

- Propriétaire et seule décisionnaire : **Ivonea** (GitHub `adimby`). Elle écrit en français et
  attend des réponses en français, tutoiement dans l'interface.
- Production : **https://app.ivonea.com** (Vercel). `ivonea.com` est réservé au futur site vitrine.
- Page de lancement commerciale (hors dépôt) : https://ivonea.whop.site/ (blueprint Whop
  « Instagram Ads Agency » transformé par prompt).
- Dépôt : https://github.com/adimby/ivoneaos

### Vision et positionnement (validés)

- Promesse commerciale : **« Ton premier client en 90 jours »**. Ivonea OS est un outil **et** un
  accompagnement (coaching). L'outil seul est l'entrée gratuite.
- Cycle retenu : **B, parcours de croissance en 3 niveaux** : Lancer (0 client), Remplir son agenda
  (déjà des clients), Grandir. Le niveau est calculé au démarrage (`workspaces.level`).
- Paiements des freelances : **chacun connecte ses propres comptes** (Papi, Whop). Ivonea OS ne
  détient jamais l'argent (pas d'agrément nécessaire).
- Revenus d'Ivonea OS : circuit séparé (abonnements, coaching, commission Whop éventuelle).

### Offres (grille validée par Ivonea)

| Offre (`workspaces.plan`) | Prix | Contenu |
| --- | --- | --- |
| Découverte (`decouverte`, défaut) | Gratuit | 20 contacts actifs, 3 devis + factures envoyés par mois, sans coaching |
| Lancement (`lancement`) | 50 000 Ar/mois | Illimité. Coaching niveau 1 en option (1,5 M Ar/mois, groupe hebdo, sans garantie) |
| Premier Client (`premier_client`, offre phare) | 2 M Ar/mois | + coaching groupe et individuel, relecture des devis, **5 rendez-vous qualifiés garantis en 90 jours** |
| Contrat Signé (`contrat_signe`) | 3 M Ar/mois | Tout, done-for-you, **premier contrat garanti en 90 jours**, sur candidature (entretien + évaluation), places limitées |

- Pas de paiement d'abonnement dans l'app au MVP : le plan se change **à la main en base** (rôle
  serveur). Réglages > Offre affiche l'adresse `IVONEA_CONTACT_EMAIL` pour demander un changement.
- Garanties : aucune ne rembourse en argent ; si la freelance a fait sa part (profil et portfolio en
  2 semaines, 20 prospects/semaine dès le mois 2, 10 séances sur 12, conseils appliqués), coaching et
  outil continuent gratuitement jusqu'à l'objectif. Le modèle de données permet de mesurer ces
  indicateurs (vues `guarantee_workspaces`, `guarantee_weekly`), sans module de coaching.

### Documents de conception (artifacts claude.ai, privés à Ivonea)

- Cadrage produit (vision, catalogue de fonctionnalités, offres, garanties) :
  https://claude.ai/code/artifact/8712ae0a-8417-472b-9990-1f2ffdf1a3c0
- Conception (parcours, écrans, modèle de données, architecture), validée le 14/10 :
  https://claude.ai/code/artifact/96b84522-b7e9-4a6e-9f19-eb76f431f0a5
- Page de lancement Whop et palette « Océan » :
  https://claude.ai/code/artifact/ec707804-32d1-4849-9e5a-ecb2596f142d

---

## 2. Stack et infrastructure

- **Next.js 16.4** (App Router, Cache Components, Server Actions, `src/proxy.ts` remplace le
  middleware), React 19, TypeScript, Tailwind CSS 4, `next-intl` (fr par défaut, en), zod.
- **Supabase** (Postgres + RLS, Auth OTP par e-mail, Storage) via `@supabase/ssr`.
  Projet de production **ivonea-os**, région Paris (eu-west-3), ref `awqydwjucpbvayodfyag`.
- **Vercel** : projet `ivonea-os`, domaine `app.ivonea.com` (CNAME chez Spaceship), 2 crons
  (`vercel.json` : `/api/cron/reminders` 05:00 UTC, `/api/cron/papi` 04:30 UTC).
- **Resend** : e-mails applicatifs et SMTP de Supabase Auth, domaine `ivonea.com` vérifié.
- **Papi** (https://papi.mg) : liens de paiement MVola / Orange Money / Airtel Money, en MGA,
  clé propre à chaque freelance, chiffrée AES-256-GCM (`PAYMENT_SECRETS_KEY`). Pas de bac à sable.
- **Whop** : paiement par carte des factures EUR/USD via comptes connectés. Code prêt mais **désactivé**
  (pas de `WHOP_API_KEY` : le compte plateforme Whop d'Ivonea OS n'existe pas encore).
- PDF : `@react-pdf/renderer` côté serveur. OCR carte fiscale : `tesseract.js` + `sharp`.
- Tests : Vitest (logique), pgTAP (`supabase/tests/`), Playwright (`e2e/`, mocks Papi/Whop/Resend).
  CI GitHub Actions : `checks`, `database`, `e2e`.
- Outils Claude du dépôt : skills dans `.claude/skills/` (Jeffallan), MCP `code-review-graph` (`.mcp.json`).

### Variables d'environnement

Liste complète et rôle de chacune : `.env.example`. Production (Vercel) : `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PAYMENT_SECRETS_KEY`, `CRON_SECRET`,
`APP_URL=https://app.ivonea.com`, `IVONEA_CONTACT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`. D'après le
fil de conception, toutes sont renseignées. Jamais en production : `PAPI_API_BASE_URL`,
`WHOP_API_BASE_URL`, `RESEND_API_BASE_URL` (tests seulement ; la construction échoue sinon).

> `PAYMENT_SECRETS_KEY` doit être sauvegardée hors du dépôt : la perdre rend illisibles toutes les
> clés Papi des freelances.

---

## 3. Architecture du code (repères)

```
src/app/[locale]/                 accueil, connexion, demarrage (accueil guidé 3 étapes)
src/app/[locale]/(app)/           écrans connectés : tableau-de-bord, contacts, pipeline, devis,
                                  factures, reglages (offre, paiements, apparence, image-de-marque),
                                  admin/verifications, plus
src/app/[locale]/p/[token]/       pages publiques devis/facture (+ pdf, payer, carte)
src/app/api/                      papi/notification, whop/webhook, cron/{reminders,papi},
                                  fiscal/verification
src/modules/                      auth, onboarding, workspace, crm, billing, payments/{papi,whop},
                                  dashboard, appearance, branding, verification
src/lib/                          supabase (clients, types générés), money, session, email, erreurs DB
supabase/migrations/              15 migrations (schéma, RLS, fonctions, storage)
supabase/tests/                   15 fichiers pgTAP
e2e/                              parcours Playwright + mocks
messages/{fr,en}.json             textes (tutoiement)
```

Règles structurantes (détail dans le README, section « Base de données ») :
- Tout appartient à un workspace ; RLS partout ; anon n'accède à aucune table (seulement les
  fonctions `get_public_quote`, `get_public_invoice`, `accept_quote`, `is_public_logo`).
- Montants en entiers `bigint` (ariary, centimes). Numéros D-/F-AAAA-NNNN sans trou, attribués à
  l'émission. Document émis figé (trigger). Paiements idempotents.
- Erreurs métier : code `55000` + clé traduite dans `errors.db.*`.
- Un module ne lit pas les tables d'un autre : il passe par ses `queries.ts`.
- Toute nouvelle fonction SQL : `revoke execute … from public, anon` puis grant ciblé.
- Après une migration : `npm run db:types` (la CI vérifie les types).

---

## 4. Ce qui est fait (en production sur app.ivonea.com)

Historique des PR fusionnées (toutes sur la branche par défaut, voir § 7) :

| PR | Contenu |
| --- | --- |
| #1 | Initialisation Next.js 16, Supabase, next-intl, Vitest |
| #2 | Base Supabase : tables, RLS, numérotation, tests pgTAP |
| #3 | Comptes (OTP e-mail), accueil guidé, thème Océan (P1) |
| #4 | Contacts, pipeline 6 étapes, historique, rappels + e-mail le jour J (P3, P4) |
| #5 | Devis, factures, PDF, pages publiques, acceptation en ligne (P5) |
| #6 | Paiement Papi : connexion de la clé, lien de paiement, notification signée, rattrapage cron |
| #7 | Tableau de bord, offres et limites Découverte, Whop (EUR/USD) |
| #8 | Parcours E2E complets, job E2E en CI, revue sécurité et UX |
| #9 | Connexion : code de 6 à 10 chiffres accepté |
| #10 | NIF/STAT demandés à la première facture (plus au démarrage), tous les pays avec recherche et favoris |
| #11 | Mise en page ordinateur et tablette (menu latéral, tableaux, kanban 6 colonnes), téléphone inchangé |
| #12 | Apparence de l'app (clair/sombre/auto, 6 palettes) et image de marque des PDF et pages client |
| #13 | Vérification NIF/STAT par photo de la carte fiscale (OCR), page admin, plafond de 3 factures |
| #14 | Démarrage en 3 étapes : activité, profil et marque, administratif |

Fonctionnellement, le MVP de `docs/spec-mvp.md` est couvert : inscription par code, démarrage,
contacts, pipeline, rappels, devis, factures, PDF, lien WhatsApp, e-mail, Papi, Whop (désactivé),
tableau de bord, limites d'offre, fr/en, personnalisation, vérification fiscale.

Base de production : les 11 premières migrations ont été appliquées le 21/10 (les 5 dernières par
Ivonea via `migrations-restantes.sql`), puis celles des PR #10, #12 et #13 par l'agent. **À vérifier
au premier passage** (MCP Supabase `list_migrations` sur `awqydwjucpbvayodfyag`) que les 15 fichiers
de `supabase/migrations/` y figurent.

---

## 5. En cours (non fusionné)

**Glisser-déposer du pipeline + secrets obligatoires en production**, sur la branche
`claude/project-thread-w330g5` (2 commits au-dessus de la PR #14, pas encore de PR) :

- `652fc96` Pipeline : glisser-déposer des cartes entre colonnes (P3.3), avec `@dnd-kit/core`.
  Tablette/ordinateur (≥ 768 px) : souris après 5 px, tactile après appui long 250 ms, mise à jour
  optimiste puis même action serveur que « Étape suivante », retour arrière avec message en cas
  d'échec, annonces lecteur d'écran. Fichiers : `src/modules/crm/components/pipeline-board.tsx`,
  `src/modules/crm/pipeline-move.ts`, `e2e/p3-glisser-deposer.spec.ts`, spec P3.3 mise à jour.
- `f96bae7` La construction de production échoue si `SUPABASE_SECRET_KEY`, `PAYMENT_SECRETS_KEY`,
  `CRON_SECRET` ou `RESEND_API_KEY` manque (`src/lib/production-env.ts`).

État au 22/10 ~21 h : 47 tests E2E verts ; double relecture faite (**2 points importants et
9 mineurs** à corriger, thèmes OK). Les retours exacts des relecteurs ne sont pas dans le dépôt :
refaire une relecture de la branche avant d'ouvrir la PR.

Étapes restantes : corriger les retours, relire, ouvrir la PR, CI verte, fusionner, vérifier le
déploiement sur app.ivonea.com. Aucune migration attendue pour ce lot.

---

## 6. Questions ouvertes et actions en attente

### Bloquant côté Ivonea

1. **E-mail du compte admin.** Personne n'est admin de la plateforme : aucun compte n'existe avec
   `ivonea.corp@gmail.com`. Sans admin, une carte fiscale que l'OCR ne lit pas ne peut être validée
   à la main (la freelance reste bloquée à 3 factures). Demander à Ivonea l'adresse avec laquelle
   elle se connecte à app.ivonea.com (ou qu'elle crée un compte et termine le démarrage), puis :
   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = '<adresse>';
   ```
   L'admin doit avoir un workspace prêt (démarrage terminé) pour ouvrir `/admin/verifications`.
2. **Compte créé le 15/10 sans profil** (avant la base) : soit appliquer
   `mise-en-production/profil-compte-existant.sql`, soit le supprimer dans Authentication > Users.
   Pas de confirmation reçue que c'est fait.

### Décisions produit encore ouvertes

- Gratuité après 90 jours : illimitée ou plafonnée ? Qui coache, combien de freelances par coach ?
  Montant minimum d'un « contrat signé », nombre de places Contrat Signé. Relecture juridique de la
  clause de garantie.
- Paiement des abonnements : à la main au MVP ; Whop (USD/EUR) ou lien de paiement pour l'Ariary plus tard.
- Langue malgache : citée dans le cadrage, non faite (fr/en seulement).
- Branche par défaut du dépôt : s'appelle encore `claude/install-skills-xye37c` (Vercel publie depuis
  elle). Ivonea peut la renommer en `main` (GitHub > Settings > General), puis aligner Vercel et la CI
  (le `push` de `ci.yml` vise `main`).

### Essais sur la vraie infrastructure (impossibles en CI)

Check-list complète dans le README (« Mise en production ») :
- Papi réel : facture de 300 Ar payée par MVola, notification signée, lien expiré recréé, rattrapage cron.
- Whop : essai complet sur le bac à sable avant de mettre `WHOP_API_KEY` et `WHOP_WEBHOOK_SECRET`
  (créer d'abord le compte plateforme Whop d'Ivonea OS et le webhook `payment.succeeded`).
- Crons visibles dans Vercel > Settings > Cron Jobs ; rappel reçu à 08:00 heure d'Antananarivo.
- Délivrabilité Resend (Gmail, Yahoo), en-têtes de sécurité, PDF sur Android/iOS.
- Pare-feu Vercel (limites de débit) : 3 règles demandent Vercel Pro ; sur Hobby, une seule règle sur
  `POST /*/connexion`.
- Sauvegardes Supabase (PITR ou quotidiennes).
- Téléphone Android d'entrée de gamme en 3G, parcours P1 à P5.

### Réglages Supabase Auth (faits le 21/10 d'après le fil, à revérifier si la connexion casse)

SMTP Resend (`smtp.resend.com`, 465, utilisateur `resend`), Site URL `https://app.ivonea.com`,
modèles « Magic Link » et « Confirm signup » = `supabase/templates/*.html` (copies dans
`mise-en-production/modele-email-*.html`), sujet « Ton code Ivonea OS / Your Ivonea OS code »,
Email OTP Length 6, limites de débit (calcul dans le README, « Mise en production de la connexion »).

---

## 7. Feuille de route après le MVP

Hors MVP par décision (spec) : SMS (Mapi), avoirs, abonnements payants dans l'app, portfolio,
prospection, projets/tâches, saisie hors ligne.

Catalogue V2/V3 du cadrage (priorités à revalider avec Ivonea) :
- **V2** : prospection LinkedIn/Facebook façon Walaxy/Lyncha avec garde-fous anti-blocage (quotas,
  délais aléatoires, horaires ouvrés), messages par IA, calendrier et planification de posts
  (livraison avancée, acceptée par Ivonea), assistant offre et client idéal, projets/tâches/temps,
  import CSV et LinkedIn, relances automatiques d'impayés, portefeuille consolidé (Whop, Payoneer, crypto).
- **V3** : recherche de missions, bibliothèque de contenus, portail client.
- Idées non placées : réseau Ivonea (délégation, entraide), personal branding, portfolio public et
  badges, avis clients et profil vérifié, contrats types, comparateur de voies de rapatriement,
  PWA hors ligne, intégration WhatsApp, parrainage, mode équipe/agence.
- Sécurité après MVP : CSP avec nonce à la place de `'unsafe-inline'` ; captcha Turnstile si abus de
  connexion ; contrôle d'authenticité de la carte fiscale (mots « CARTE FISCALE », échantillon manuel).

---

## 8. Où se trouvent les choses

| Quoi | Où |
| --- | --- |
| Code, spec, README | Dépôt `adimby/ivoneaos` (`docs/spec-mvp.md`, `README.md`, ce fichier) |
| Travail en cours (glisser-déposer) | Branche `claude/project-thread-w330g5` |
| Script SQL des 5 migrations du 15–16/10 (**déjà appliqué**, historique) | Dossier partagé du projet : `mise-en-production/migrations-restantes.sql` |
| Profil du compte du 15/10 | `mise-en-production/profil-compte-existant.sql` |
| Modèles d'e-mail Auth (identiques entre eux) | `mise-en-production/modele-email-{magic-link,confirm-signup}.html` et `supabase/templates/` |
| Copie de ce document | Dossier partagé du projet : `HANDOFF.md` |
| Base de production | Supabase, projet `ivonea-os` (`awqydwjucpbvayodfyag`, Paris) |
| Hébergement | Vercel, projet `ivonea-os`, domaine `app.ivonea.com` |
| DNS | Spaceship (`ivonea.com`) |
| Indicateurs de garantie | SQL editor Supabase : `select * from guarantee_weekly` |
| Journaux paiements | Table `webhook_events` ; journaux Vercel (`[whop] …`, `[papi] …`) |

---

## 9. Comment travailler avec Ivonea (habitudes observées)

- Elle aime **discuter avant de coder** une nouvelle fonctionnalité : proposer, donner une
  recommandation, attendre son accord, puis écrire une courte spec dans `docs/spec-mvp.md`.
- Elle a demandé une **qualité « premium »** : un agent construit, deux relecteurs vérifient,
  corrections jusqu'à approbation ; tests E2E pour chaque parcours ; CI verte avant fusion.
- Elle valide les choix de design (palette Océan, noms d'offres) et de périmètre ; ne pas élargir le
  périmètre sans son accord (en particulier pas de module de coaching).
- Les actions dans ses comptes (Supabase dashboard, Vercel, DNS, Whop) qui demandent une confirmation
  sont faites par elle : lui donner les étapes exactes, clic par clic.
- Réponses courtes, en français, sans jargon ; liens directs vers ce qu'elle doit ouvrir.
- Le compte Claude atteint souvent sa limite d'usage : découper le travail en lots livrables.
