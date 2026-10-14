# Ivonea OS

Outil de gestion complète pour freelances (CRM, devis, facturation), ciblant Madagascar.
Stack prévue : Next.js (App Router) sur Vercel + Supabase (Postgres, Auth, RLS).
L'utilisatrice écrit en français : réponds en français.

## Style de réponse (claude-token-efficient)
- Lire les fichiers existants avant d'écrire. Ne pas relire un fichier inchangé.
- Raisonnement complet, réponse concise. Pas de formule d'ouverture ni de conclusion inutile.
- Ne pas deviner une API, une version, un flag ou un nom de paquet : vérifier dans le code ou la doc.
- Solution la plus simple qui marche. Pas d'abstraction pour un usage unique, pas de fonctionnalité spéculative.
- Revue de code : énoncer le bug, montrer le correctif, s'arrêter.

## Skills : lequel utiliser
Les skills se déclenchent seuls selon la tâche. En cas de recouvrement, cet ordre prime :
1. **Process (superpowers)** : `brainstorming` avant toute nouvelle fonctionnalité, `writing-plans` / `executing-plans`,
   `test-driven-development`, `systematic-debugging`, `verification-before-completion` avant de dire "terminé".
   Ces skills priment sur `tdd`, `diagnosing-bugs` et `code-review` de Matt Pocock.
2. **Cadrage (Matt Pocock)** : `grill-me` / `grilling` pour challenger une idée, `to-spec`, `to-tickets`,
   `domain-modeling`, `handoff`.
3. **Stack (Jeffallan, dans `.claude/skills`)** : `nextjs-developer`, `react-expert`, `typescript-pro`,
   `postgres-pro` / `sql-pro` (schéma Supabase, RLS), `secure-code-guardian` (auth, paiements, données clients),
   `security-reviewer`, `playwright-expert` (tests E2E), `api-designer`, `fullstack-guardian`.
4. **Graphe de code (code-review-graph)** : `explore-codebase`, `review-changes`, `refactor-safely`, `debug-issue`
   quand le code est assez gros pour qu'un graphe aide. Le serveur MCP tourne via `uvx` (Python 3.10+ et uv requis).

## Bonnes pratiques (claude-code-best-practice)
- Garder ce fichier court : chaque ligne est chargée à chaque session.
- Planifier avant de coder une tâche de plusieurs fichiers ; vérifier (tests, build, lint) avant de livrer.
- Données sensibles (clés Supabase, `.env`) jamais commitées.
