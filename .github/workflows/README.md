# Workflows GitHub Actions

## `claude.yml` — Review de PR par Claude Code

Review automatisée des pull requests via
[`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action),
déclenchée à la demande. La review s'appuie sur le skill
[`.claude/skills/review/SKILL.md`](../../.claude/skills/review/SKILL.md) et sur le
contexte projet de [`CLAUDE.md`](../../CLAUDE.md).

### Déclenchement

1. **Commentaire `@claude review`** sur une PR.
   - Réservé aux `OWNER`, `MEMBER` et `COLLABORATOR` du repo (les commentaires
     externes sont ignorés).
2. **Manuel via `workflow_dispatch`** (onglet *Actions* → *Claude PR Review* → *Run
   workflow*), avec :
   - `pr_number` (requis) — numéro de la PR à reviewer ;
   - `model` (optionnel, défaut `claude-opus-4-8`) — modèle Claude à utiliser.

### Ce que fait le workflow

- Poste un résumé de la PR.
- Liste les problèmes détectés priorisés par sévérité
  (🔴 critique / 🟠 important / 🟡 mineur).
- Fournit une checklist par domaine (logique plugin, transformations ASL,
  compatibilité, conventions, sécurité, tests/CI, docs).
- Donne un verdict final (approve / request changes / commentaires).
- Publie le tout via `gh pr comment` et en commentaires inline.

### Configuration technique

- **Runner** : `self-hosted`.
- **Timeout** : 20 minutes.
- **Permissions** (minimales) : `contents: read`, `pull-requests: write`,
  `issues: write`.
- **MCP servers** : Terraform (`hashicorp/terraform-mcp-server`) et AWS Docs
  (`awslabs.aws-documentation-mcp-server`).
- **Secret** : `ANTHROPIC_API_KEY_CODE_REVIEW` (configuré au niveau de
  l'organisation).

### Coût

Chaque review consomme l'API Anthropic. Surveiller l'usage et privilégier le
déclenchement à la demande plutôt que sur chaque PR.
