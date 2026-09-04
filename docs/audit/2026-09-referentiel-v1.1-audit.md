# Audit Nolaa HQ vs Référentiel d'évolution v1.1

**Date :** 4 septembre 2026
**Référentiel audité :** « Référentiel fonctionnel et backlog d'évolution de Nolaa HQ » v1.1 (3 sept. 2026)
**Code audité :**

| Dépôt | Branche | Commit |
|---|---|---|
| `nola-studio/nola-hq-backend` | `dev` | `aa09c08` |
| `nola-studio/nola-hq` | `dev` | `1b3ec36` |

**Méthode :** lecture des 55 entités TypeORM, des 36 contrôleurs et des 42 écrans
frontend, puis confrontation domaine par domaine avec le référentiel. Chaque
constat ci-dessous est rattaché à un fichier réel. Les verdicts corrigent, quand
c'est nécessaire, l'auto-évaluation du §1.2 du référentiel — celle-ci est
globalement juste mais **datée sur deux points** (Domaine 6 et impersonation).

---

## 1. Verdict global

| Domaine | Référentiel dit | Code dit | Verdict |
|---|---|---|---|
| 1 — Groupe & gouvernance | Partielle | `LegalEntity` (5 champs métier), `BusinessUnit`, `audit`, `activity` | ✅ conforme au diagnostic |
| 2 — Organisations & équipes | Très faible | Aucune notion de département/poste (`grep department` = 0) | ✅ conforme |
| 3 — Personnes, RH & accès | Très faible | `TeamMember` plat **avec `password_hash`** | ⚠️ **plus grave que décrit** (§2.1) |
| 4 — Marques, produits, PI | Partielle | `Product` (7 champs métier), registre `apps` en mémoire | ⚠️ **plus faible que décrit** (§2.2) |
| 5 — Stratégie & décisions | Avancée | `RoadmapObjective` + `KeyResult` + `Initiative` + `Trajectory` | ✅ la meilleure couverture du produit |
| 6 — Projets & ingénierie | « modèles concurrents » | **Fusion StudioProject/StudioTask → `work_items` déjà faite** | ❌ **diagnostic obsolète** (§2.3) |
| 7 — Clients & commercial | Avancée, doublons | Doublons confirmés, mais pas ceux annoncés | ⚠️ voir §3 |
| 8 — Finance | Faible | Aucun ledger, aucun P&L, aucune consolidation | ✅ conforme |
| 9 — Support & exploitation | Avancée | `tickets` + SLA + ingestion event-bus | ✅ conforme, **avec un atout non mentionné** (§4.1) |
| 10 — Marketing | Quasi absent | `grep campaign` = 0 occurrence | ✅ conforme |
| 11 — Juridique & risques | Très faible | `project_risks` uniquement (rattaché à un projet) | ✅ conforme |
| 12 — Documentation & EXE-* | Quasi absente | Aucun registre, aucune API publique | ✅ conforme, **c'est le plus gros trou** |
| 5.8 — Versionnement (REL-*) | — | Version en mémoire, perdue au redémarrage | ⚠️ **bloquant technique** (§4.3) |

### 1.1 Ce que le référentiel sous-estime

**§2.1 — `TeamMember` porte l'authentification.**
`src/team/team-member.entity.ts` déclare `password_hash`, et le README confirme :
« les utilisateurs HQ sont l'équipe Nola interne, donc pas de Keycloak — bcrypt
local sur `team_members.password_hash` ». Cela contredit frontalement la décision
§14.7 du référentiel (« Désigner Nola Auth comme seule source d'identité ») et
l'architecture de vérité §6. HR-01 ne peut pas être traité comme un épic RH : c'est
d'abord une **migration d'authentification**, avec un risque de rupture de session
pour toute l'équipe. À isoler et à séquencer avant ORG-01, pas après.

**§2.2 — Le produit canonique est plus creux que « partiel ».**
`Product` n'a que `code`, `name`, `businessUnitId`, `isInternal`, `sourceAliases`,
`archived`, `isProvisionable`. Aucun des champs exigés par PRD-01 (marque, entité
de PI, cible, pays, phase, modèle de revenu, criticité, propriétaire) n'existe.
Le lifecycle PRD-03 n'a aucun support : `archived` est un booléen, pas un état.
En revanche `sourceAliases` est déjà le mécanisme demandé par PRD-02 pour
Yekoli/Yokeli/Kelasi — l'épic PRD-02 est donc à requalifier en « peupler et
arbitrer », pas « construire ».

### 1.2 Ce que le référentiel surestime — Domaine 6

Le §Domaine 6 écrit : « `RoadmapInitiative`, `WorkItem`, Studio Project, Studio
Task et Studio Request se chevauchent ». **Trois de ces cinq objets n'existent
plus.** La migration `src/migrations/1786600000000-DropStudioProjectsAndTasks.ts`
a supprimé `studio_projects` et `studio_tasks` ; `work_items` est le backbone
unique et `src/studio/studio-projects-proxy.controller.ts` n'est plus qu'un
adaptateur de compatibilité, documenté comme tel dans
`src/work-items/work-item-studio-mapping.ts`.

Conséquence sur le backlog de programme (§9) : **ENG-02 « Migration des modèles
concurrents » est réalisée aux deux tiers**. Ce qui reste réellement à faire :

1. `StudioRequest` — le sujet du §2 ci-dessous ;
2. `RoadmapInitiative.scope: 'project' | 'initiative'` — un seul modèle porte deux
   concepts que le référentiel veut distincts (Initiative vs Projet), ce qui rend
   la taxonomie ENG-01 (Domaine → Capacité → Objectif → Initiative → Epic → Story)
   impossible à représenter : il manque les niveaux **Capacité**, **Epic** et
   **Story**. `WorkItem.type` vaut `bug | feature | task | ops | debt` — ni
   `epic`, ni `story`, ni `spike`, ni `décision`.

ENG-01 doit donc redescendre en tête du backlog, mais recadré : ce n'est plus
« unifier des modèles concurrents », c'est **ajouter les deux niveaux manquants
au-dessus de `work_items`**.

---

## 2. Focus — les Demandes (`StudioRequest`)

### 2.1 Ce que fait le flux aujourd'hui

`src/studio/studio-request.entity.ts` · `studio-requests.service.ts` ·
`studio-requests.controller.ts` · `nola-hq/src/screens/StudioRequests.tsx` (684 lignes).

```
Auteur ──POST /studio/requests──▶ statut « nouvelle »
                                       │
                        (opérateur, manuel) POST /:id/status → « en_revue »
                                       │
                        (opérateur, manuel) clic « Convertir »
                                       │
                        ┌──────────────▼──────────────┐
                        │  Modale ConvertDialog        │
                        │  • Titre     (re-saisi)      │
                        │  • Projet    (obligatoire)   │
                        │  • Catégorie (obligatoire)   │
                        │  • Priorité  (re-saisie)     │
                        └──────────────┬──────────────┘
                                       │
                    POST /:id/convert ─┴─▶ WorkItem créé + statut « acceptee »
```

**Le diagnostic de l'utilisateur est exact, et le code en donne la raison
mesurable :** `ConvertDialog` (`StudioRequests.tsx:583-684`) re-demande quatre
champs dont **deux sont déjà connus** (`title`, `priority`, présents sur la
demande) et dont un troisième (`projectId`) est souvent déjà rempli. La modale
initialise `category` à `'product'` en dur, sans le déduire de `request.type`.
Le service, lui, sait déjà faire la traduction : `REQUEST_PRIORITY_TO_TASK_PRIORITY`
(`studio-requests.service.ts:19-24`) mappe P0→urgent, P1→high, P2→medium, P3→low,
et `dto.priority ?? REQUEST_PRIORITY_TO_TASK_PRIORITY[request.priority]` montre que
le champ du formulaire n'est qu'un **override optionnel présenté comme obligatoire**.

Autrement dit : **le backend est déjà capable de convertir sans aucune saisie
supplémentaire, sauf `projectId` et `category`.** C'est l'UI qui impose le
formulaire long, pas le modèle.

### 2.2 Ce que le référentiel dit de ce flux

Trois passages visent directement cet objet :

- **§7 Doublons** — « `StudioRequest` / `Ticket` / `Change` → distinguer demande
  interne, incident et changement ».
- **EPIC SUP-03 (P0)** — « créer trois objets distincts et leurs workflows », avec
  la user story « convertir une demande d'évolution en changement facturable ».
- **EPIC EXE-05 (P0)** — « transformer un manifest validé en proposition de
  backlog. La première étape est toujours un `Draft Backlog` ».

Le référentiel demande donc **l'inverse d'une conversion manuelle** : une demande
doit produire *automatiquement* une proposition d'élément de backlog, que
l'opérateur **valide ou rejette**, au lieu de la ressaisir.

### 2.3 Le vrai problème : deux cycles de vie parallèles

`StudioRequest` est un `WorkItem` appauvri qui redéfinit tout :

| Capacité | `WorkItem` | `StudioRequest` |
|---|---|---|
| Statuts | 6 (`todo`→`closed`) | 5 (`nouvelle`→`fermee`), **incompatibles** |
| Priorités | `P0-P3` | `P0-P3` (identiques) |
| Commentaires | `work_item_comments` | ❌ |
| Pièces jointes | `work_item_attachments` | ❌ |
| Historique | `work_item_events` | ❌ |
| Dépendances | `work_item_dependencies` | ❌ |
| Sous-tâches | `work_item_subtasks` | ❌ |
| Sprint / estimation | oui | ❌ |
| Référence lisible | `reference` (`PRJ-42`) | ❌ (UUID nu) |
| Kanban | oui (`Tasks.tsx`) | ❌ (tableau trié) |

Le commentaire d'entête de `StudioRequests.tsx` porte encore la trace du glissement :
« unlike tasks, a request never converts into work » — **c'est faux depuis l'ajout
de `convert()`**, et le fichier contient lui-même la modale de conversion. Le
modèle a changé de nature sans que sa raison d'être soit refondée.

Deux conséquences opérationnelles observables dans le code :

1. **La demande devient un cul-de-sac.** `assertStatusMutable()` traite `acceptee`
   comme terminal : une fois convertie, la demande est gelée et son auteur ne voit
   plus rien de l'avancement réel du ticket. Le lien est unidirectionnel
   (`StudioRequest.linkedWorkItemId` → `WorkItem`), rien ne remonte du `WorkItem`
   vers l'auteur.
2. **Aucune traçabilité de provenance.** Le `WorkItem` créé ne sait pas d'où il
   vient : aucun champ `source_*`. C'est exactement ce qu'EXE-07 exige de pouvoir
   répondre — « pourquoi cet élément de backlog existe-t-il ? ».

### 2.4 Recommandation — remplacer, pas améliorer

**`StudioRequest` doit devenir un état d'entrée de `work_items`, pas une table.**

#### Cible

```
Capture (1 champ)          Triage (automatique)           Backlog (validé)
──────────────────         ────────────────────           ────────────────
Titre + description   ──▶  WorkItem                  ──▶  WorkItem
libre, 1 clic              status = 'triage'               status = 'todo'
                           type   = déduit                 position assignée
                           priority = déduite              projet confirmé
                           project = déduit ou null
                           source_kind = 'request'
                           source_author = email
                                   │
                                   └──▶ 1 clic « Accepter » / « Rejeter »
```

#### Ce que ça change concrètement

| Aujourd'hui | Cible |
|---|---|
| 2 tables, 2 cycles de vie | 1 table, 1 cycle de vie |
| 5 champs à la capture | 1 champ (titre) + description optionnelle |
| 4 champs à la conversion | 0 champ — 1 bouton « Accepter » |
| 2 actions opérateur (statut, puis convertir) | 1 action |
| Demande gelée après acceptation | L'auteur suit le ticket jusqu'à la livraison |
| Pas d'historique, pas de commentaires | Hérite de tout le socle `work_items` |

#### Étapes techniques

1. **`work_items` : ajouter un statut `triage` en amont de `todo`**, exclu du
   Kanban par défaut et exposé comme une colonne « Boîte de réception ». Le
   backlog devient une file unique, ce que demande ENG-03.
2. **Ajouter les champs de provenance EXE-07 sur `work_items`** :
   `source_kind` (`request` | `manifest` | `support` | `github` | `manual`),
   `source_ref_id`, `source_author`, `source_excerpt_hash`, `generation_method`,
   `validation_status`, `approved_by`. Ces champs servent les demandes *aujourd'hui*
   et les Execution Manifests *plus tard* — c'est le même besoin, une seule fois.
3. **Déduction automatique à la capture**, dans le service, sans UI :
   - `type` ← `request.type` : `bug`→`bug`, `suggestion`→`feature`, `demande`→`task` ;
   - `priority` ← table existante `REQUEST_PRIORITY_TO_TASK_PRIORITY`, déjà écrite ;
   - `category` ← déduite du projet cible, ou `null` (le champ est déjà nullable
     sur `WorkItem`, la modale l'exigeait sans raison) ;
   - `projectId` ← celui de la demande, sinon `null` (déjà nullable).
4. **Remplacer `ConvertDialog` par deux boutons** sur la ligne : « Accepter »
   (`status: 'triage' → 'todo'`) et « Rejeter » (`→ 'closed'` + motif). L'opérateur
   qui veut corriger le projet ou la priorité le fait ensuite dans le Kanban, avec
   les outils qui existent déjà — au lieu de les redemander avant.
5. **Migrer `studio_requests` vers `work_items`** (`status='triage'` pour les
   non converties, suppression des converties déjà liées), garder la route
   `/studio/requests` en redirection vers `/tasks?view=triage`, retirer la table.

#### Ce que ça débloque au-delà des demandes

Cette refonte n'est pas un correctif d'UX : elle construit **le point d'entrée
unique du backlog** que le référentiel exige quatre fois (ENG-03, SUP-03, EXE-05,
EXE-07). Une fois `status='triage'` + champs `source_*` en place :

- l'ingestion event-bus support (§4.1) peut déposer directement dans le triage
  au lieu de créer un ticket qu'on recopie à la main ;
- EXE-05 « Draft Backlog » devient l'écriture d'un lot de `work_items` en `triage`
  — le mécanisme de validation existe déjà, il n'y a plus qu'à l'alimenter ;
- EXE-07 est satisfait par construction, pour toutes les sources à la fois.

**C'est le plus petit changement du dépôt qui débloque le plus d'épics P0 du
référentiel.** Il devrait passer devant ENG-01.

---

## 3. Doublons — ce que le §7 dit vs. ce que le code montre

| §7 du référentiel | Réalité du code | Verdict |
|---|---|---|
| `BusinessClient` / `Tenant` / IAM Organization | Confirmé. `business_clients` (9 champs métier) et `tenants` (12 champs métier) n'ont **aucune clé étrangère entre eux** — un client Khi-Lab devenu tenant est saisi deux fois | ✅ **réel, P0** |
| `TeamMember` / IAM Person / Nola Auth User | Confirmé et **aggravé** : `TeamMember` porte `password_hash` (§1.1) | ✅ **réel, P0** |
| `PipelineItem` / `BusinessOpportunity` | Confirmé. `pipeline_items` = 6 colonnes plates héritées (`stage`, `amt`, `age: string`), `business_opportunities` = 13 colonnes avec devise, probabilité, `loss_reason`. Les deux sont vivants (écrans `/pipeline` et `/business`), mais le premier n'a ni devise, ni probabilité, ni raison de perte | ✅ **réel, mais trivial** — migrer les lignes vers `business_opportunities` et retirer `pipeline_items`, pas « unifier deux modèles » |
| `BusinessInvoice` / `Invoice` | **Ce ne sont pas des doublons.** `invoices` = facturation SaaS par tenant (7 colonnes) ; `business_invoices` = facturation client avec TVA, lignes, reçu vérifiable, séquence (23 colonnes) | ⚠️ **à requalifier** : la décision §7 « unifier ou séparer » est déjà tranchée dans le code, il manque juste la documentation de la frontière |
| `RoadmapInitiative` / `StudioProject` | `studio_projects` **n'existe plus**. Le vrai doublon est interne : `RoadmapInitiative.scope` porte à la fois « projet » et « initiative » | ❌ **obsolète, à réécrire** |
| `WorkItem` / `StudioTask` | `studio_tasks` **n'existe plus** (migration `1786600000000`) | ❌ **résolu** |
| `StudioRequest` / `Ticket` / `Change` | Confirmé — voir §2 | ✅ **réel, P0** |
| `BusinessUnit` / `Brand` / `Department` | Confirmé, mais `Brand` et `Department` **n'existent pas** : `BusinessUnit` porte seul les trois rôles (`code`, `tagline`, `footerLine`, `theme` = attributs de marque sur un objet économique) | ✅ **réel** |

**Un doublon non listé par le référentiel :** `project_risks` (rattaché à un
projet, `src/work-items/project-risk.entity.ts`) préfigure RSK-01 « registre des
risques groupe ». Construire RSK-01 sans reprendre cette table créerait le
neuvième doublon. À intégrer explicitement dans l'épic.

---

## 4. Constats non couverts par le référentiel

### 4.1 Un mécanisme d'ingestion existe déjà — le référentiel l'ignore

`src/tickets/support-ingest.listener.ts` consomme
`nola.events.{kelasi,yekoli}.support.requested` sur l'EventBus `@nola-studio/sdk`
et crée des tickets HQ automatiquement, avec normalisation de catégorie et de
priorité, tolérance aux payloads malformés et dédoublonnage.

**C'est un prototype fonctionnel d'EXE-02** (« API publique d'ingestion »), en
transport message-bus plutôt qu'HTTP. Les épics EXE-02/EXE-03 devraient être
rédigés comme *« généraliser `support-ingest` en pipeline d'ingestion multi-source
et lui ajouter une façade HTTP »*, et non comme une construction depuis zéro.
Cela réduit sensiblement EXE-02, et impose de traiter les deux transports
ensemble pour ne pas créer deux chemins d'ingestion concurrents.

### 4.2 L'impersonation contrôlée (IAM-02) est déjà à moitié construite

`src/assist/assist.service.ts` + `nola-hq/src/components/Impersonate.tsx`
implémentent déjà : motif obligatoire, résolution de la cible via IAM, jeton
impersoné émis par nola-auth, code à usage unique, deeplink, expiration.

Manquent, par rapport à IAM-02 : la bannière visible côté app cible, la durée
maximale configurable, l'approbation préalable et la révocation immédiate.
**L'épic doit être requalifié P2-complément, pas P0-construction.**

### 4.3 Le versionnement (REL-01/03/05) a un bloquant technique non identifié

`src/apps/apps.service.ts:126` : `private readonly manifestHistory = new Map<...>`.
Le registre des applications **et** l'historique de versions sont en mémoire
process, plafonnés à 10 entrées (`MAX_MANIFEST_HISTORY`) et **perdus à chaque redémarrage**.
La version courante provient du heartbeat de l'app, pas d'une chaîne de release.

Conséquence : REL-01 (« version canonique automatique ») et REL-05 (« historique,
comparaison et rollback ») ne sont **pas des épics d'intégration CI/CD** tant que
cette persistance n'existe pas. Il manque une table `app_versions` et un objet
`Release`. `deploys` (`app`, `version`, `env`, `sha`, `changelog`, `ticketId`)
couvre déjà la moitié de REL-03 côté déploiement — mais rien ne distingue
`Latest Release Version` de `Latest Deployed Version`, puisque l'objet Release
n'existe pas.

**Ajouter au backlog, avant REL-01 :** `REL-00 — Persistance du registre
applicatif et des versions` (P0).

---

## 5. Backlog corrigé — les 10 premiers éléments

Réordonnancement du §9 du référentiel à la lumière du code réel. Les rangs
indiqués sont ceux du référentiel d'origine.

| # | Élément | Rang §9 | Justification du déplacement |
|---:|---|---:|---|
| 1 | **REQ-01 — Demandes → triage `work_items`** (nouveau) | — | §2. Plus petit changement débloquant ENG-03, SUP-03, EXE-05 et EXE-07 |
| 2 | **HR-01 — Personne canonique** | 3 | §1.1 : `password_hash` sur `TeamMember` est une dette de sécurité, pas un sujet RH |
| 3 | **ENG-01 — Taxonomie** (recadré : ajouter Capacité/Epic/Story) | 1 | §1.2 : deux tiers déjà faits, périmètre réel plus étroit |
| 4 | **CRM-02 — Déduplication `BusinessClient`/`Tenant`** | 5 (via CRM-01) | §3 : la vue 360 est impossible tant que les deux tables sont disjointes |
| 5 | **PRD-01 — Produit canonique** | 4 | §1.1 : plus creux qu'annoncé, bloque FIN-01 et ARC-01 |
| 6 | **REL-00 — Persistance registre applicatif** (nouveau) | — | §4.3 : bloquant technique de REL-01/03/05 |
| 7 | **DOC-01 — Bibliothèque documentaire** | 6 | Confirmé : plus gros trou, aucun prérequis manquant |
| 8 | **EXE-01/02 — Registre + ingestion** (recadré) | 21-22 | §4.1 : généralisation de `support-ingest`, pas une construction |
| 9 | **ORG-01 — Hiérarchie organisationnelle** | 2 | Descend : dépend de HR-01 et n'est bloquant pour rien d'autre à court terme |
| 10 | **RSK-01 — Registre des risques** | 10 | Inchangé, mais doit absorber `project_risks` (§3) |

### Suppressions recommandées du backlog

- **ENG-02 « Migration des modèles concurrents »** — réalisée aux deux tiers ;
  le reste est couvert par REQ-01 et ENG-01. Fermer l'épic.
- **`BusinessInvoice` / `Invoice`** (§7) — pas un doublon. Remplacer par une
  tâche de documentation d'un quart de journée.
- **`PipelineItem` / `BusinessOpportunity`** (§7) — pas une unification :
  une suppression de table héritée.

---

## 6. Décisions de direction à ajouter au §14

Le §14 en liste 16. Trois manquent, et elles bloquent le travail décrit ci-dessus :

17. **Le cycle de vie des demandes est-il fusionné dans `work_items` ?**
    (§2.4 — conditionne REQ-01, et donc l'ordre de tout le backlog)
18. **Quelle est la frontière `Invoice` (SaaS) / `BusinessInvoice` (client) ?**
    Le code l'a déjà tranchée ; il faut l'entériner ou la corriger (§3)
19. **L'ingestion se fait-elle sur l'EventBus, en HTTP, ou les deux ?**
    (§4.1 — deux chemins concurrents seraient le doublon suivant)
