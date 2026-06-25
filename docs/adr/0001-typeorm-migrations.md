# ADR 0001 — Migrations TypeORM en production (fin de `synchronize: true`)

- **Statut** : Accepté
- **Date** : 2026-06-25
- **Contexte** : audit prod-readiness `nola-hq-backend`

## Problème

En production (Postgres / Railway), TypeORM était configuré avec
`synchronize: true` (`src/app.module.ts`). À chaque boot, TypeORM compare les
entités au schéma réel et **altère/supprime automatiquement** colonnes et
tables pour les faire correspondre. Sur une base contenant des données réelles,
c'est un risque de **perte de données / corruption de schéma** non maîtrisé
(renommage d'entité → `DROP COLUMN`, changement de type → cast destructif…).
Aucune migration n'existait : le schéma était entièrement piloté par le sync.

## Décision

Le schéma de production devient **piloté par migrations**.

- **Postgres (prod)** : `synchronize: false`, `migrationsRun: true`. Les
  migrations sont chargées via un glob relatif au module compilé
  (`${__dirname}/migrations/*.{js,ts}`) et appliquées au démarrage.
- **SQLite (dev)** : on **conserve** `synchronize: true`. La base dev n'a pas
  de données à protéger, et la baseline Postgres n'est de toute façon pas
  compatible SQLite (types `SERIAL`, etc.).
- Un **DataSource CLI** dédié (`src/data-source.ts`, Postgres uniquement,
  `DATABASE_URL` requis) outille la génération/exécution/rollback.
- Une **migration baseline** (`src/migrations/<ts>-Baseline.ts`) crée
  l'intégralité du schéma actuel (17 tables + index), de sorte qu'une **base
  neuve** se construit entièrement par migration.

## Démarche (expand/contract, réversible)

1. `bun run migration:generate src/migrations/<Nom>` — génère le diff
   entités ↔ schéma (contre un Postgres).
2. Relire le SQL généré ; pour tout changement potentiellement destructif,
   appliquer **expand → migrate données → contract** sur plusieurs releases.
3. `bun run migration:run` (ou `migrationsRun: true` au boot) — applique.
4. `bun run migration:revert` — rollback de la dernière migration.

La baseline a été **vérifiée** : `run` crée les 17 tables, `revert` les
supprime proprement (table `migrations` seule restante). Rollback testé.

## Conséquences

- ✅ Plus de mutation de schéma implicite au boot en prod.
- ✅ Schéma versionné, revu en PR, rejouable, réversible.
- ⚠️ Toute évolution d'entité **exige désormais une migration** (sinon la prod
  ne voit pas le changement). Le sync dev aide à itérer, mais la migration est
  obligatoire avant merge.
- ⚠️ Première mise en prod sur une base **existante** : ne PAS rejouer la
  baseline sur un schéma déjà créé par l'ancien `synchronize`. Marquer la
  baseline comme déjà appliquée (`INSERT INTO migrations`) ou repartir d'une
  base neuve. À valider lors du déploiement.
