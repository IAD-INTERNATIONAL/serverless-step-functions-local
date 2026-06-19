# CLAUDE.md

Contexte projet pour Claude Code.

## Domaine métier

`serverless-step-functions-offline` (publié en interne sous
`@IAD-INTERNATIONAL/serverless-step-functions-offline`) est un **plugin pour le
[Serverless Framework](https://serverless.com/)**. Il permet d'exécuter des AWS
Step Functions **en local** lors du développement, en s'appuyant sur le service
[AWS Step Functions Local](https://docs.aws.amazon.com/step-functions/latest/dg/sfn-local.html).

Au démarrage de `serverless offline`, le plugin lit les state machines définies
dans le `serverless.yml` du projet hôte et les crée (ou met à jour) sur
l'endpoint Step Functions Local. Il gère également :

- le remplacement des ARN de ressources (`TaskResourceMapping`) pour pointer vers
  des lambdas/ressources locales ;
- la transformation des **Distributed Map** (`ItemProcessor` en mode
  `DISTRIBUTED`) en map inline mockée, le service local ne supportant pas la
  syntaxe distribuée ;
- le mock des appels AWS SDK (`s3:getObject`, `s3:putObject`).

## Stack

- **Langage** : JavaScript (Node.js, CommonJS, `require`).
- **Type** : plugin Serverless Framework (`peerDependencies: serverless ^2 || ^3`).
- **Dépendance runtime** : `aws-sdk` v2.
- **Lint / test** : [`xo`](https://github.com/xojs/xo) (`xo: { space: true }` →
  indentation 2 espaces). Pas de framework de test : `npm test` lance `xo`.
- **Point d'entrée** : `index.js` (champ `main`), une seule classe
  `ServerlessStepFunctionsOffline`.

## Architecture

Tout le code tient dans `index.js` :

- `constructor` — lit la config sous `custom['step-functions-offline']`, valide
  `accountId` et `region`, instancie le client `AWS.StepFunctions` vers
  `stepFunctionsEndpoint` (défaut `http://localhost:8083`), enregistre le hook
  `offline:start:init`.
- `getStepFunctionsFromConfig` — récupère les state machines depuis la config et
  applique `TaskResourceMapping`.
- `replaceTaskResourceMappings` — remplace récursivement les `Resource` selon le
  mapping fourni.
- `removeDistributedAttributes` — convertit les Distributed Map en map inline +
  état `Prepare<State>` mockant l'item reader.
- `replaceAwsSdkCallToTaskMock` — remplace les Resource AWS SDK S3 par les mocks
  configurés.
- `createEndpoints` — crée la state machine (ou `updateStateMachine` si
  `StateMachineAlreadyExists`) et expose son ARN via
  `process.env.OFFLINE_STEP_FUNCTIONS_ARN_<name>`.

## Configuration (côté projet hôte)

Sous `custom.step-functions-offline` dans le `serverless.yml` :

- `accountId` (**requis**) — AWS account ID.
- `region` (**requis**) — région AWS.
- `stepFunctionsEndpoint` — endpoint Step Functions Local (défaut
  `http://localhost:8083`).
- `TaskResourceMapping` — mapping d'ARN de Resource pour le local.
- `distributedMapResource` — ARN/resource utilisé pour mocker l'item reader des
  Distributed Map.
- `awsSdkS3getObjectResource` / `awsSdkS3putObjectResource` — mocks des appels
  AWS SDK S3.

## Commandes locales

```bash
npm install      # installe les dépendances
npm test         # lance le lint xo (= seule "suite de tests")
npx xo --fix     # corrige automatiquement les erreurs de lint
```

Le plugin n'est pas exécuté seul : il est consommé par un projet Serverless qui
lance `serverless offline` (le hook `offline:start:init` déclenche la création
des state machines).

## Conventions

- Indentation **2 espaces**, style imposé par `xo`.
- CommonJS (`require` / `module.exports`), pas d'ESM.
- Pas de TypeScript, pas de build step.
- Garder le code dans `index.js` sauf nécessité claire.

## Environnements

Aucun déploiement : c'est une librairie/plugin npm publiée sous l'organisation
`@IAD-INTERNATIONAL`. Pas de mapping d'environnements AWS propre au repo.

## CI/CD

Pas de pipeline applicatif dans ce repo. Le seul workflow GitHub Actions est
`.github/workflows/claude.yml` (review de PR à la demande, voir
`.github/workflows/README.md`).
