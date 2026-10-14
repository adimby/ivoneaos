# Ivonea OS

Le bureau du freelance malgache : CRM, devis, factures et paiement mobile money (Papi), puis Whop pour les clients étrangers.

Conception : [Ivonea OS : conception](https://claude.ai/code/artifact/96b84522-b7e9-4a6e-9f19-eb76f431f0a5).

## Stack

- Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4
- Supabase (Postgres, RLS, Auth, Storage) via `@supabase/ssr`
- `next-intl` : français (par défaut) et anglais, routes `/fr` et `/en`
- Vitest pour la logique métier

## Démarrer

```bash
npm install
cp .env.example .env.local   # renseigner l'URL et la clé publique Supabase
npm run dev
```

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
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
