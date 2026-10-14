# Skills du projet

Skills copiés depuis des dépôts tiers (licence MIT, voir `../third-party-licenses/`).
Claude les charge automatiquement et les déclenche selon leur `description`.

| Skill | Source | Commit |
|---|---|---|
| nextjs-developer, react-expert, typescript-pro, postgres-pro, sql-pro, secure-code-guardian, security-reviewer, playwright-expert, api-designer, fullstack-guardian | [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) | 1be15d8 |
| explore-codebase, review-changes, debug-issue, refactor-safely | [tirth8205/code-review-graph](https://github.com/tirth8205/code-review-graph) (nécessite le serveur MCP de `.mcp.json`) | 6b12d11 |

Le pack Jeffallan complet (67 skills, ~11k tokens chargés à chaque session) est déclaré dans
`.claude/settings.json` mais pas activé. Pour l'activer : `/plugin install fullstack-dev-skills@fullstack-dev-skills`.

Mise à jour : recopier le dossier du skill depuis le dépôt source et changer le commit ci-dessus.
