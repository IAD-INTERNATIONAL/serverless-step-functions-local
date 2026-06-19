---
name: review
description: Review une PR de ce repo (plugin Serverless Framework Node.js / aws-sdk). Produit un résumé, des problèmes priorisés par sévérité, une checklist par domaine et un verdict final, puis poste le tout via gh pr comment et en commentaires inline.
---

# Review de PR — serverless-step-functions-offline

Plugin **Serverless Framework** en JavaScript (Node.js, CommonJS) qui exécute des
AWS Step Functions en local via Step Functions Local. Tout le code applicatif est
dans `index.js`. Lint via `xo` (2 espaces). Voir `CLAUDE.md` pour le contexte complet.

## Procédure

1. Récupère le diff de la PR : `gh pr diff <PR>` (et `gh pr view <PR>` pour le contexte).
2. Lis les fichiers touchés en entier pour comprendre l'impact, pas seulement le diff.
3. Concentre l'analyse sur les domaines ci-dessous.
4. Poste la review (résumé + problèmes + checklist + verdict) via `gh pr comment <PR> --body <...>`.
5. Poste les problèmes localisables en **commentaires inline** sur les lignes concernées.

## Domaines à vérifier

### Logique du plugin (`index.js`)
- Le hook `offline:start:init` et l'ordre des appels (`getStepFunctionsFromConfig`
  puis `createEndpoints`) restent cohérents.
- Validation de la config (`accountId`, `region`) préservée ; erreurs explicites.
- Parcours récursifs (`replaceTaskResourceMappings`, `removeDistributedAttributes`,
  `replaceAwsSdkCallToTaskMock`) : pas de mutation hasardeuse, cas de bord gérés
  (état précédent introuvable, ItemReader absent ou multiple, Choice vs Next/Default).
- Transformation Distributed Map : la map inline générée reste sémantiquement
  équivalente ; clés `Prepare<State>` non collisionnantes.
- Mocks AWS SDK S3 et `distributedMapResource` : configurables, pas de valeur en dur.

### State machines & ASL
- Compatibilité avec la syntaxe Amazon States Language (Map, Choice, Task, Wait…).
- Gestion correcte de `StateMachineAlreadyExists` → `updateStateMachine` (parsing de l'ARN).
- Pas de régression sur `roleArn` / `accountId` injectés.

### Compatibilité & dépendances
- Respect des `peerDependencies` (`serverless ^2 || ^3`) et de l'usage `aws-sdk` v2.
- Pas d'API Node récente non supportée par les runtimes ciblés.
- Pas de breaking change non documenté pour les projets hôtes (options `custom`).

### Qualité & conventions
- Style conforme à `xo` (2 espaces) ; `npm test` (= `xo`) passe.
- Pas de `console.log` oublié ; utiliser `this.log` si besoin.
- CommonJS, pas d'ESM ; pas de dépendance superflue ajoutée.
- README et `CLAUDE.md` mis à jour si le comportement public change.

### Sécurité
- Pas de secret/credential en dur ; ARNs et endpoints restent configurables.
- Pas d'injection via valeurs de config interpolées sans contrôle.

### Tests / CI
- `npm test` (lint `xo`) doit passer.
- Vérifier qu'aucun fichier généré ou `node_modules` n'est commité.

## Format de la review (à poster)

### Résumé
2-4 lignes : ce que change la PR et pourquoi.

### Problèmes détectés
Liste priorisée, chaque item préfixé par sa sévérité et localisé (`fichier:ligne`) :
- 🔴 **critique** — bug, régression, faille, casse la compat.
- 🟠 **important** — à corriger avant merge (cas de bord, mauvaise gestion d'erreur).
- 🟡 **mineur** — style, lisibilité, nit.

### Checklist
- [ ] Logique plugin / hooks
- [ ] Transformations ASL (Distributed Map, mocks)
- [ ] Compatibilité peerDeps / aws-sdk
- [ ] Conventions & lint `xo`
- [ ] Sécurité (pas de secret, ARNs configurables)
- [ ] Tests / CI verts
- [ ] Docs (README / CLAUDE.md)

### Verdict
L'un de : ✅ **approve** / 🔄 **request changes** / 💬 **commentaires**.
Justifie en une phrase.
