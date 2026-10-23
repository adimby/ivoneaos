# Ivonea OS : sauvegarde pour reprise (23 octobre 2026)

À lire en premier par l'agent qui reprend. Réponds à Ivonea **en français** (elle tutoie dans l'app).
Lis aussi `CLAUDE.md`, `README.md` et `docs/spec-mvp.md` dans le dépôt : ce sont les références.

## 1. Où en est le projet

**Le MVP défini dans `docs/spec-mvp.md` est complet côté code et en ligne** sur https://app.ivonea.com.

Dernières livraisons (toutes fusionnées, CI verte, déploiement de production prêt) :

| PR | Contenu |
|----|---------|
| #12 | Personnalisation : apparence de l'app (clair/sombre/auto, 6 palettes) et image de marque des PDF (logo, bannière, couleurs, police) |
| #13 | Vérification NIF/STAT : photos recto/verso, lecture automatique (tesseract.js côté serveur), repli manuel par un admin, page `/admin/verifications`, plafond de 3 factures tant que non vérifié, photos supprimées après décision |
| #14 | Démarrage en 3 étapes (activité, profil et marque, administratif), NIF non obligatoire au démarrage |
| #16 | Glisser-déposer des cartes du pipeline (ordinateur et tablette, @dnd-kit/core 6.3.1) ; build de production refusé si un secret serveur manque |

Décisions d'Ivonea déjà prises (ne pas reposer la question) :
- Pendant la vérification fiscale, le freelance peut facturer, **3 factures maximum**, puis blocage ; aucune mention sur la facture.
- Lecture automatique avec un outil **libre et gratuit** ; sinon vérification manuelle par les admins.
- Les photos de carte fiscale ne sont **pas conservées** une fois la vérification décidée.
- Le PDF est personnalisable par le freelance (logo ou non, bannière, polices, couleurs).
- Méthode de travail voulue : diviser en plusieurs agents, chacun **vérifie le travail de l'autre**, ne pas s'arrêter avant une qualité « premium » validée.

## 2. Ce qui reste à faire

### À faire dès qu'Ivonea s'est inscrite
Ivonea veut être admin avec **hello@ivonea.com** (pas encore inscrite au 23/10, vérifié en base). Une fois son compte créé sur app.ivonea.com, exécuter sur Supabase prod (projet `awqydwjucpbvayodfyag`, SQL editor ou MCP `execute_sql`) :

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'hello@ivonea.com'
on conflict do nothing;
-- vérifier : 1 ligne
select u.email from public.platform_admins a join auth.users u on u.id = a.user_id;
```

L'entrée « Admin » apparaît alors dans la navigation, et les e-mails « carte à vérifier » partent vers elle (Resend).

### Réglages de production
Ivonea dit avoir terminé (23/10) : SMTP Resend dans Supabase Auth, paiement Papi réel de 300 Ar, sauvegarde PITR. Restent à cocher dans `README.md` > « Mise en production » si ce n'est pas fait : crons visibles dans Vercel (Settings > Cron Jobs), en-têtes de sécurité sur le domaine, limites de débit (pare-feu Vercel, offre Pro), test sur un vrai téléphone Android en 3G.

### Points mineurs connus (non bloquants)
- Pas de limitation de débit dans l'app elle-même (hors connexion) : dépend du pare-feu Vercel.
- PDF des devis non archivé (seules les factures le sont).
- `src/modules/workspace/components/logo-field.tsx` : aperçu du logo sur fond blanc même en mode sombre (volontaire : le PDF est blanc).
- Montants irréalistes (≈ 1 milliard) coupés à l'intérieur du nombre dans les colonnes étroites du pipeline.
- Test E2E `p5-parcours-complet` : coupure ECONNRESET occasionnelle en CI au téléchargement du PDF (relancer une fois le job).

## 3. Infrastructure

- **Dépôt** : GitHub `adimby/ivoneaos`. Branche de production (base des PR) : `claude/install-skills-xye37c`. Toute fusion dessus déploie en production.
- **Vercel** : projet `ivonea-os` (`prj_tRpPrjVfeEk3srgWjSbGzyBuD6nA`), équipe `team_F2IecKI8nIlPwdvSBorek0hS`, domaine app.ivonea.com. Variables de prod présentes : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PAYMENT_SECRETS_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `IVONEA_CONTACT_EMAIL`. Le build échoue si l'une des obligatoires manque (`src/lib/production-env.ts`). `WHOP_API_KEY` et `WHOP_WEBHOOK_SECRET` ne sont pas renseignées : le paiement par carte est masqué tant que Whop n'est pas mis en service (README, « Mise en service de Whop »).
- **Supabase prod** : projet `awqydwjucpbvayodfyag`. Les migrations du dossier `supabase/migrations/` sont toutes appliquées (dernière : `20261023090000_fiscal_verification.sql`). Pour une nouvelle migration : la tester en local (`npx supabase db reset`, `npm run test:db`), puis l'appliquer en prod (MCP `apply_migration` avec le SQL complet, ou `supabase db push`).
- **Jamais de secret dans le dépôt** (`.env*` ignorés ; `.env.example` documente les variables).

## 4. Pile et commandes

Next.js 16.4.1 (App Router, Cache Components), React 19.3, next-intl (fr par défaut, en), Tailwind 4, zod 4, Supabase (Postgres, Auth par code e-mail, RLS, Storage), @react-pdf/renderer, tesseract.js + sharp (OCR), Resend (e-mails), Papi (Mobile Money, MGA) et Whop (carte, EUR/USD).

```bash
npm ci
npx supabase start            # pile locale (Docker requis)
cp .env.example .env.local    # remplir avec `npx supabase status`
npm run dev
npm run lint && npm run typecheck && npm test && npm run build
npm run test:db               # pgTAP
npm run test:db:concurrency   # numérotation et plafonds sous concurrence
npm run test:e2e              # Playwright sur un build de production (port 3100)
npm run db:types              # régénérer les types après une migration
```

CI GitHub (`.github/workflows/ci.yml`) : jobs `checks`, `database`, `e2e`. Fusionner seulement quand les trois sont verts.

## 5. Organisation du code

- `src/app/[locale]/` : pages (app connectée sous `(app)/`, pages publiques des documents sous `p/`, `demarrage/`, `admin/`).
- `src/modules/` : un dossier par domaine (crm, quotes, invoices, payments, verification, onboarding, branding, appearance, workspace, auth…), chacun avec ses actions serveur, schémas zod, composants et tests.
- `src/components/ui/` : composants partagés (dont `file-drop.tsx`).
- `messages/fr.json`, `messages/en.json` : textes (tutoiement en français).
- `supabase/migrations/`, `supabase/tests/` (pgTAP), `scripts/test-db-concurrency.sh`.
- `e2e/` : un fichier par parcours de la spec (p1 à p12), plus accessibilité (axe WCAG AA) et responsive.

## 6. Conseils pour l'agent qui reprend

- Lire un fichier avant de le modifier ; ne pas deviner une API ou une version : vérifier dans `node_modules` ou la doc.
- Toute nouvelle fonctionnalité : la décrire dans `docs/spec-mvp.md`, tester (Vitest, pgTAP si base, Playwright), vérifier l'accessibilité et les 6 palettes clair/sombre.
- Environnement cloud : Chromium est déjà installé (`/opt/pw-browsers`), ne jamais lancer `playwright install`. Si Docker est arrêté : `containerd &` puis `dockerd --containerd=/run/containerd/containerd.sock &`, les conteneurs Supabase redémarrent seuls.
