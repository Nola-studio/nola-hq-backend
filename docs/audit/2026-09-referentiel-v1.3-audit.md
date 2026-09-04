# Audit Nolaa HQ vs Référentiel d'évolution v1.3

**Date :** 4 septembre 2026
**Référentiel audité :** « Référentiel fonctionnel et backlog d'évolution de Nolaa HQ » v1.3 (4 sept. 2026)
**Remplace :** l'audit v1.1 du même jour — voir §0 pour la correction qu'il contenait.

| Dépôt | Branche | Commit |
|---|---|---|
| `nola-studio/nola-hq-backend` | `dev` | `aa09c08` |
| `nola-studio/nola-hq` | `dev` | `1b3ec36` |

**Méthode.** v1.3 ajoute le §4A, qui donne pour chaque domaine sa définition, ses
devoirs, ses **objets principaux** et, pour cinq d'entre eux, sa **frontière**.
C'est ce qui est audité ici : pour chacun des 12 domaines, les objets §4A sont
confrontés un à un aux 55 entités TypeORM réellement déployées. La mesure qui en
sort — *objets canoniques présents / objets attendus* — est plus sévère et plus
exploitable que l'échelle « avancée / partielle / faible » du §1.2, parce qu'elle
dit **ce qui manque**, pas seulement combien.

---

## 0. Correction de l'audit v1.1

L'audit précédent affirmait que `TeamMember` portait l'authentification locale et
que HR-01 était donc d'abord une migration d'authentification à risque. **C'est
faux.** `AuthService.login()` (`src/auth/auth.service.ts:56-70`) délègue à
`NolaAuthService.silentLogin()` — un password grant OIDC contre le realm Keycloak
`nola-hq` — puis vérifie le JWT contre les JWKS du realm. Le docblock du fichier
l'énonce : « la table `team_members` … ne gère plus de mot de passe : Keycloak est
l'autorité. »

Ce qui reste est **résiduel** : la colonne `password_hash` existe encore sur
l'entité (jamais lue — `team.service.ts` ne fait que la retirer des réponses), la
dépendance `bcryptjs` est encore dans `package.json` sans un seul import, et le
README documente toujours le comportement retiré (« pas de Keycloak — bcrypt local
sur `team_members.password_hash` »).

**Conséquences :**

1. La tâche HR-01 « supprimer l'authentification locale du modèle `TeamMember` »
   est **déjà faite**. Il reste une colonne morte, une dépendance morte et un
   README à corriger — une demi-journée, pas un épic.
2. Le §Domaine 2 du référentiel (« Risque actuel ») et l'audit v1.1 ont tous deux
   été induits en erreur par **le même README périmé**. C'est un cas d'école pour
   DOC-01 : la documentation est déjà une source de vérité concurrente, et elle a
   déjà produit une décision de priorisation erronée.
3. HR-01 redescend dans le backlog corrigé (§7).

---

## 1. Couverture mesurée sur les objets du §4A

Pour chaque domaine : objets attendus par le §4A, objets réellement portés par une
entité, et objets seulement approchés par une entité conçue pour autre chose.

| Domaine | Objets §4A | Portés | Approchés | Verdict §4A | §1.2 dit |
|---|---:|---:|---:|---|---|
| 1 — Groupe et gouvernance | 12 | 1 | 2 | Registre absent | Partielle |
| 2 — Organisations et équipes | 9 | 0 | 3 | **Aucun objet canonique** | Très faible |
| 3 — Personnes, RH et accès | 12 | 2 | 5 | Identité oui, RH non | Très faible |
| 4 — Marques, produits et PI | 9 | 2 | 3 | Fiche produit creuse | Partielle |
| 5 — Stratégie et décisions | 8 | 4 | 1 | **Le mieux couvert** | Avancée |
| 6 — Projets et ingénierie | 16 | 6 | 2 | Socle bon, chaîne code absente | Avancée |
| 7 — Clients et commercial | 10 | 5 | 3 | Bon, mais dédoublé | Avancée |
| 8 — Finance | 11 | 1 | 2 | Aucun modèle analytique | Faible |
| 9 — Support et exploitation | 11 | 2 | 3 | **Ticketing ≠ ITSM** | Avancée |
| 10 — Marketing | 9 | 0 | 1 | Rien | Quasi absent |
| 11 — Juridique et risques | 9 | 1 | 3 | Rien de consolidé | Très faible |
| 12 — Documentation et savoir | 14 | 0 | 5 | **Aucun objet canonique** | Quasi absente |

### 1.1 Les deux écarts entre le §4A et le §1.2

**Domaine 9 — « Avancée » au §1.2, 2 objets sur 11 au §4A.**
Les deux jugements portent sur des choses différentes. `tickets`, `ticket_events`,
`sla_policies`, l'escalade par échéance et l'ingestion event-bus font effectivement
un bon **outil de ticketing**. Mais le §4A n'attend pas un outil de ticketing : il
attend `Service`, `Incident`, `Problème`, `Changement`, `Post-mortem`, `SLI`,
`SLO`, `Runbook`. Sur ces huit-là, **aucun n'existe** — `health_entries` (uptime,
latence, erreurs 24 h) approche le SLI, rien d'autre.

Le §4A rend donc SUP-03 plus urgent qu'il n'en avait l'air : ce n'est pas
« séparer trois statuts », c'est créer sept objets absents.

**Domaine 6 — « Avancée » au §1.2, mais la moitié des objets manquants sont
exactement les nouveaux epics de v1.3.** Sur les 16 objets : projet, initiative,
tâche, bug, sprint et dépendance existent ; epic, story, spike, `repository lié`,
`branche`, `PR liée`, `gate`, `contribution event` n'existent pas ; `preuve` et
`timeline` sont approchés par `work_item_attachments` et `work_item_events`.

### 1.2 Ce que le §4A révèle et que v1.1 ne montrait pas

**Domaine 2 — zéro objet canonique, pas « équipe plate ».**
Le §1.2 parle d'une « équipe plate ». Le §4A attend `Organisation`,
`Département`, `Équipe`, `Poste`, `Rattachement`, `Responsabilité`, `RACI`,
`Paramètre organisationnel`, `Règle d'héritage`. **Il n'existe pas d'entité
Équipe.** `team_members` est une liste de personnes ; `business_units` est une
unité économique porteuse d'attributs de marque (`tagline`, `footerLine`,
`theme`) ; `module_overrides` porte des paramètres par tenant, pas par unité
organisationnelle. Le domaine 2 n'est pas incomplet : **il n'a pas commencé.**

**Domaine 4 — l'unique morceau de registre PI est rangé sous Studio.**
`studio_domains` porte registrar, date d'achat, date de renouvellement, prix,
`auto_renew` et propriétaire. C'est exactement un fragment d'IP-01 (« domaines,
licences, propriétaires, renouvellements »), mais il vit sous le module Studio et
référence un projet, pas un produit. Construire IP-01 sans reprendre cette table
créerait un doublon — comme `project_risks` pour RSK-01 (§5).

**Domaine 11 — le mécanisme d'échéance existe déjà, réduit à un seul domaine.**
`business_reminders` est générique : `entity_type` couvre déjà cinq types,
`due_at`, statut, assigné, clé d'idempotence. CMP-01 (calendrier réglementaire) et
IP-01 (renouvellements) demandent le même mécanisme. Il est à généraliser, pas à
réécrire.

---

## 2. Frontières — les cinq domaines qui en déclarent une

Le §4A pose une frontière explicite sur les domaines 2, 3, 6, 8 et 12. C'est la
partie la plus directement vérifiable du référentiel, et celle qui décide si un
objet est à sa place.

### D3 — « Nolaa HQ ne doit pas recréer les mots de passe, sessions ou mécanismes d'authentification de Nola Auth »

**Mots de passe : frontière respectée** (voir §0). **Sessions : à trancher.**

HQ maintient son propre `SessionStoreService` et chiffre le payload dans un cookie
AES-256-GCM (`session-cipher.service.ts`), documenté comme un port du pattern BFF
de `kelasi-backend`. C'est un choix d'architecture défendable — un BFF qui garde
les jetons Keycloak côté serveur n'est pas une identité concurrente — mais la
lettre de la frontière l'interdit.

**À trancher explicitement** (décision 21, §8) : soit la frontière est reformulée
en « HQ ne détient ni identifiants ni annuaire », soit le pattern BFF est retiré.
Le laisser implicite garantit que la question reviendra à chaque revue.

### D2 / D3 — « le domaine décrit la structure du travail ; le dossier individuel appartient au domaine 3 »

**Frontière franchie.** `team_members` mélange les deux : `role`, `tag`, `perms[]`
et `hq_access` relèvent de la structure (D2), `email`, `country`, `notify_email`,
`last_login_at` et `avatar` du dossier individuel (D3). Tant qu'il n'existe ni
`Équipe` ni `Poste`, la séparation n'a nulle part où se faire — c'est pourquoi
ORG-01 et HR-01 doivent être traités **ensemble**, et non l'un après l'autre comme
au §9 du référentiel.

### D6 — « GitHub reste la source canonique du code, des commits, branches et pull requests »

**Frontière non franchie, parce que le lien n'existe pas du tout.** Une recherche
`github` sur tout le backend ne retourne que deux commentaires citant un jeu de
données de pays. Il n'y a ni client GitHub, ni webhook, ni table de liaison.

C'est la bonne nouvelle et la mauvaise : rien n'est à défaire, et ENG-06, ENG-08,
ENG-09, ENG-10 et ENG-11 partent tous de zéro — cinq epics dont deux P0, sur une
dépendance commune inexistante.

### D8 — « Nolaa HQ n'est pas nécessairement le grand livre de comptabilité légale »

**Frontière respectée**, et par défaut : il n'y a ni ledger, ni écriture, ni
période. `project_budgets`, `business_expenses`, `studio_expenses` et le cashflow
sont des vues de gestion. Rien à défaire avant FIN-01.

### D12 — « les systèmes spécialisés restent sources canoniques de leurs données opérationnelles »

**Frontière respectée, mais la mémoire est hors base.** Les ADR vivent dans
`docs/adr/`, les modèles de documents dans `design/*.html`, le catalogue
applicatif dans une `Map` en mémoire (§6.3). Aucun de ces trois n'est un objet
interrogeable, versionné ou relié. Le §4A appelle ce domaine « la mémoire
institutionnelle » : elle existe, mais elle est dans le dépôt Git, pas dans le
produit.

---

## 3. Focus — les demandes (`StudioRequest`)

### 3.1 Le constat, inchangé depuis v1.1

`ConvertDialog` (`nola-hq/src/screens/StudioRequests.tsx:583-684`) redemande quatre
champs, dont **deux sont déjà portés par la demande** (`title`, `priority`), un
troisième (`projectId`) est souvent déjà rempli, et le quatrième (`category`) est
initialisé à `'product'` en dur.

Le service sait déjà s'en passer : `REQUEST_PRIORITY_TO_TASK_PRIORITY`
(`studio-requests.service.ts:19-24`) mappe P0→urgent … P3→low, et l'appel s'écrit
`dto.priority ?? REQUEST_PRIORITY_TO_TASK_PRIORITY[request.priority]`. **Le champ
du formulaire n'est qu'un override optionnel présenté comme obligatoire.** Les deux
seuls champs réellement absents, `projectId` et `category`, sont **nullables sur
`WorkItem`**. C'est l'interface qui impose le formulaire, pas le modèle.

### 3.2 Ce que la règle de conception du §4A.2 tranche

v1.3 ajoute quatre questions à poser avant tout module. Appliquées aux demandes :

| Question §4A.2 | Réponse |
|---|---|
| Dans quel domaine vit l'objet canonique ? | **D6.** Le §4A y place « transformer les besoins et référentiels en travail planifié » et l'objet `story`/`tâche`. Aucun objet « demande » n'apparaît dans les 11 objets de D9. |
| Quel domaine peut le référencer sans le dupliquer ? | **D9**, qui doit « permettre la conversion d'une demande d'évolution en changement ou travail facturable » — donc référencer, pas détenir. |
| Quel système est sa source de vérité ? | Nolaa HQ, ligne « Cycle métier du work item » du §6. |
| Quels événements synchronisent les autres systèmes ? | Ceux d'ENG-09 — aujourd'hui aucun. |

**`studio_requests` échoue à la première question.** Il détient un objet dont le
domaine canonique est D6, avec son propre cycle de vie. Le §4A.2 conclut de
lui-même : « si ces réponses ne sont pas claires, le modèle doit être clarifié
avant la création de nouveaux écrans ou de nouvelles tables ».

### 3.3 Deux cycles de vie parallèles

`StudioRequest` est un `WorkItem` appauvri qui redéfinit tout et perd tout :

| Capacité | `WorkItem` | `StudioRequest` |
|---|---|---|
| Statuts | 6, `todo` → `closed` | 5, incompatibles |
| Commentaires | `work_item_comments` | ❌ |
| Pièces jointes | `work_item_attachments` | ❌ |
| Historique | `work_item_events` | ❌ |
| Dépendances | `work_item_dependencies` | ❌ |
| Sous-tâches | `work_item_subtasks` | ❌ |
| Sprint, estimation | oui | ❌ |
| Référence lisible | `PRJ-42` | UUID nu |
| Kanban | oui | tableau trié |

Deux conséquences visibles dans le code :

1. **La demande est un cul-de-sac.** `assertStatusMutable()` traite `acceptee`
   comme terminal : une fois convertie, la demande est gelée, et son auteur ne
   voit plus rien de l'avancement. Le lien est unidirectionnel.
2. **Aucune provenance.** Le `WorkItem` créé ne sait pas d'où il vient : aucun
   champ `source_*`. C'est la question qu'EXE-07 exige de trancher — « pourquoi cet
   élément de backlog existe-t-il ? »

Le commentaire d'entête de l'écran porte encore la trace du glissement — « unlike
tasks, a request never converts into work » — dans le fichier même qui contient la
modale de conversion.

### 3.4 Recommandation — remplacer, pas améliorer

**`StudioRequest` doit devenir un état d'entrée de `work_items`, pas une table.**

| Aujourd'hui | Cible |
|---|---|
| 2 tables, 2 cycles de vie | 1 table, 1 cycle |
| 5 champs à la capture, 4 à la conversion | 1 champ requis, 0 à l'acceptation |
| 2 actions opérateur | 1 clic |
| Demande gelée après acceptation | L'auteur suit jusqu'à la livraison |
| Ni historique ni commentaires | Hérite du socle `work_items` |

1. **Ajouter un statut `triage`** en amont de `todo`, hors Kanban par défaut,
   exposé comme colonne « Boîte de réception ». Le backlog devient une file
   unique — ce que demande ENG-03.
2. **Ajouter les champs de provenance EXE-07 sur `work_items`** : `source_kind`
   (`request` · `manifest` · `support` · `github` · `manual`), `source_ref_id`,
   `source_author`, `source_excerpt_hash`, `generation_method`,
   `validation_status`, `approved_by`. Ils servent les demandes aujourd'hui, les
   Execution Manifests demain et les événements GitHub d'ENG-09 ensuite — même
   besoin, écrit une seule fois.
3. **Déduire à la capture**, côté service : `bug→bug`, `suggestion→feature`,
   `demande→task` ; priorité via la table déjà écrite ; catégorie déduite du
   projet ou nulle.
4. **Remplacer la modale par « Accepter » / « Rejeter »**. La correction du projet
   ou de la priorité se fait ensuite dans le Kanban, avec les outils existants.
5. **Migrer `studio_requests`**, garder `/studio/requests` en redirection vers la
   file de triage, retirer la table.

### 3.5 Ce que ça débloque

Ce n'est pas un correctif d'ergonomie : c'est **le point d'entrée unique du
backlog**, exigé à cinq endroits du référentiel v1.3 — ENG-03, SUP-03, EXE-05,
EXE-07 et désormais **ENG-09**, dont les seize événements (`branch.created` …
`acceptance.approved`) ont besoin du même socle de provenance pour distinguer
« événement observé, règle appliquée et transition résultante ».

Une fois `triage` et les champs `source_*` en place : l'ingestion support dépose
directement dans la file au lieu de créer un ticket qu'on recopie ; le Draft
Backlog d'EXE-05 devient un lot d'items en triage ; et EXE-07 est satisfait par
construction, pour toutes les sources à la fois.

**C'est le plus petit changement du dépôt qui débloque le plus d'epics P0.**

---

## 4. Les quatre nouveaux epics de v1.3

v1.3 ajoute la capacité 6.5 (`ENG-08`, `ENG-09`) et la capacité 6.6 (`ENG-10`,
`ENG-11`), plus quatre décisions (17-20). Le code n'en couvre rien, mais trois
amorces existent.

| Epic | Prio | État réel | Amorce exploitable |
|---|---|---|---|
| ENG-08 — Development Workspace & Branch Automation | P0 | Néant | Aucune. `WorkItem.reference` (`PRJ-42`) fournit déjà la clé stable qu'exige la convention `feature/{KEY}-{slug}` |
| ENG-09 — Evidence-driven Work Item Lifecycle | P0 | Néant | `work_item_events` (9 actions internes) est la table d'événements ; il lui manque la provenance externe |
| ENG-10 — Execution Contribution Graph | P1 | Néant | `activity_events` (acteur, catégorie, `ref`) et la barre d'activité quotidienne de `TenantDetail.tsx` |
| ENG-11 — Work Item Activity Timeline | P1 | Néant | `work_item_events` à nouveau |

### 4.1 ENG-06 est la dépendance manquante de tous les quatre

Le §9 place ENG-06 au rang 16 en **P1**, et ENG-08/09 aux rangs 33-34 en **P0**
avec ENG-06 en dépendance. **Un P0 ne peut pas dépendre d'un P1 classé dix-sept
rangs plus haut.** Comme il n'existe aucune intégration GitHub, ENG-06 est le
chemin critique de la capacité 6.5 et de la capacité 6.6 : il doit passer P0 et
remonter juste avant ENG-08.

### 4.2 ENG-10 a besoin d'un objet que `activity_events` ne peut pas porter

Le modèle demandé par ENG-10 — `person_id`, `team_id`, `work_item_id`,
`contribution_type`, `source_system`, `source_event_id`, `occurred_at`,
`evidence_url`, `weight_rule_version` — impose trois choses qu'`activity_events`
n'a pas : un rattachement typé au work item, une **clé de déduplication**
(`source_system` + `source_event_id`, exigée par le critère d'acceptation 5) et une
**version de règle de pondération** (exigée par le critère 6, « une modification
des règles n'altère pas silencieusement l'historique »).

`activity_events` porte `actor`, `cat`, un texte libre et un `ref` optionnel : un
journal narratif. **À créer comme table distincte**, pas à étendre — et `team_id`
suppose ORG-01, ce que la dépendance déclarée (`ENG-09, HR-01`) omet.

### 4.3 ENG-09 et le workflow existant

La politique cible de v1.3 (`Backlog → In Progress → In Review → Ready for
Validation → Ready for Release → Done`) compte six états. `WorkItemStatus` en a
six aussi — `todo`, `in_progress`, `blocked`, `review`, `resolved`, `closed` —
mais ce ne sont pas les mêmes : il manque `Ready for Release` et il y a `blocked`
en plus. La migration `1787600000000` documente que le couple `backlog`/`todo` a
déjà été fusionné une fois ; **le rouvrir demande une décision explicite**, sans
quoi ENG-09 rejouera la migration à l'envers.

Point favorable : v1.3 précise que les politiques sont « configurables par type de
work item, produit et repository » et qu'« une tâche non technique ne doit pas être
forcée à suivre un workflow GitHub ». Les catégories `sales`, `brand`,
`admin_legal` de `WorkItem.category` fournissent déjà l'axe de configuration.

---

## 5. Doublons — le §7 confronté au code

| §7 du référentiel | Réalité du code | Verdict |
|---|---|---|
| `BusinessClient` / `Tenant` / IAM Organization | Confirmé. 9 champs métier d'un côté, 12 de l'autre, **aucune clé étrangère entre les deux** | **Réel, P0** |
| `StudioRequest` / `Ticket` / `Change` | Confirmé — §3 | **Réel, P0** |
| `TeamMember` / IAM Person / Nola Auth User | **Requalifié** : l'identité est déjà déléguée (§0). Reste une colonne morte et un README faux | Réel, mais mineur |
| `BusinessUnit` / Brand / Department | Confirmé, et pire : ni Brand ni Department n'existent. `BusinessUnit` porte seul les trois rôles | Réel |
| `PipelineItem` / `BusinessOpportunity` | Confirmé. Les deux écrans sont vivants ; le premier n'a ni devise, ni probabilité, ni raison de perte | Réel, trivial — migrer puis supprimer |
| `BusinessInvoice` / `Invoice` | **Pas des doublons.** 7 colonnes de facturation SaaS par tenant ; 23 colonnes de facturation client avec TVA, lignes, reçu vérifiable et séquence | À requalifier : documenter la frontière |
| `RoadmapInitiative` / `StudioProject` | `studio_projects` **n'existe plus**. Le vrai doublon est interne : `scope` porte « projet » et « initiative » | À réécrire |
| `WorkItem` / `StudioTask` | Table supprimée par la migration `1786600000000` | **Résolu** |

**Deux doublons que le §7 n'annonce pas**, tous deux du même type — une amorce
rangée dans le mauvais domaine, qu'un épic à venir recréerait :

- `project_risks` (rattaché à un projet) préfigure **RSK-01** ;
- `studio_domains` (registrar, renouvellement, prix) préfigure **IP-01**.

Les deux epics doivent inscrire la reprise de ces tables dans leur périmètre.

---

## 6. Constats non couverts par le référentiel

### 6.1 Un mécanisme d'ingestion existe déjà — EXE-02 est à moitié écrit

`src/tickets/support-ingest.listener.ts` consomme
`nola.events.{kelasi,yekoli}.support.requested` sur l'EventBus du SDK et crée des
tickets HQ automatiquement, avec normalisation de catégorie et de priorité,
tolérance aux payloads malformés et dédoublonnage.

C'est un prototype fonctionnel d'EXE-02, en transport message-bus plutôt qu'HTTP.
EXE-02 et EXE-03 doivent se lire « généraliser `support-ingest` en pipeline
multi-source et lui ajouter une façade HTTP ». Cela réduit sensiblement l'épic —
et impose de traiter les deux transports ensemble, faute de quoi on crée deux
chemins d'ingestion concurrents.

### 6.2 L'impersonation contrôlée est déjà à moitié construite

Le module `assist` et le composant `Impersonate` implémentent motif obligatoire,
résolution de la cible via IAM, jeton impersoné émis par nola-auth, code à usage
unique, deeplink et expiration. Manquent, par rapport à IAM-02 : la bannière
visible côté application cible, la durée maximale configurable, l'approbation
préalable et la révocation immédiate. **Épic à requalifier P2-complément.**

### 6.3 Le versionnement a un bloquant technique non identifié

`apps.service.ts:126` tient le registre applicatif **et** l'historique de versions
dans des `Map` en mémoire process, plafonnés à 10 entrées et **perdus à chaque
redémarrage**. La version courante vient du heartbeat de l'application, pas d'une
chaîne de release.

REL-01 et REL-05 ne sont donc pas des epics d'intégration CI/CD tant que cette
persistance n'existe pas. `deploys` (`app`, `version`, `env`, `sha`, `changelog`,
ticket d'approbation) couvre déjà la moitié de REL-03 côté déploiement, mais rien
ne distingue *Latest Release Version* de *Latest Deployed Version*, puisque l'objet
`Release` n'existe pas — celui-là même dont ENG-09 a besoin pour son événement
`release.published`.

**À ajouter : `REL-00 — Persistance du registre applicatif et des versions` (P0).**

### 6.4 `work_sprints` n'a ni capacité ni vélocité

ENG-04 demande « objectif de sprint, vélocité, capacité, report, burndown et
rétrospective ». `work_sprints` porte `name`, `goal`, `status`, `start_date`,
`end_date`. L'objectif existe ; les cinq autres non.

---

## 7. Backlog corrigé — les douze premiers

Réordonnancement du §9 à la lumière du code réel et des définitions §4A. L'ordre
est une séquence de déblocage : chaque rang lève une contrainte du suivant.

| # | Élément | Rang §9 | Justification |
|---:|---|---:|---|
| 1 | **REQ-01 — Demandes vers le triage `work_items`** *(nouveau)* | — | §3. Plus petit changement débloquant ENG-03, SUP-03, EXE-05, EXE-07 et ENG-09 |
| 2 | **ENG-01 — Taxonomie** (recadré : ajouter Capacité, Epic, Story, Spike) | 1 | Les deux tiers sont faits ; le périmètre réel est plus étroit |
| 3 | **ENG-06 — Synchronisation GitHub** *(P1 → P0)* | 16 | §4.1. Dépendance de quatre epics dont deux P0, et strictement inexistante |
| 4 | **ORG-01 + HR-01 — Structure et personne canoniques**, ensemble | 2 et 3 | §2. La frontière D2/D3 n'a nulle part où se faire tant que `Équipe` et `Poste` n'existent pas |
| 5 | **CRM-02 — Déduplication client / tenant** | 5 | La vue 360 est impossible tant que les deux tables sont disjointes |
| 6 | **PRD-01 — Produit canonique** | 4 | 2 objets sur 9 ; bloque FIN-01 et ARC-01 |
| 7 | **REL-00 — Persistance du registre applicatif** *(nouveau)* | — | §6.3. Bloquant de REL-01, REL-03, REL-05 et de `release.published` (ENG-09) |
| 8 | **ENG-08 — Start Work et automatisation des branches** | 33 | Devient atteignable dès ENG-06 ; forte valeur quotidienne |
| 9 | **DOC-01 — Bibliothèque documentaire** | 6 | §0 : un README périmé a déjà faussé une priorisation |
| 10 | **EXE-01 / EXE-02 — Registre et ingestion** (recadrés) | 21-22 | §6.1. Généralisation de `support-ingest` |
| 11 | **SUP-03 — Incident, problème, changement** | 9 | §1.1. Sept objets absents, pas trois statuts à séparer |
| 12 | **RSK-01 — Registre des risques** | 10 | Doit absorber `project_risks` |

### À retirer du backlog

- **ENG-02, migration des objets de travail** — réalisée aux deux tiers ; le reste
  est couvert par REQ-01 et ENG-01. Fermer l'épic.
- **`BusinessInvoice` / `Invoice`** — pas un doublon. Une tâche de documentation.
- **`PipelineItem` / `BusinessOpportunity`** — pas une unification : une migration
  de lignes puis une suppression de table.
- **HR-01, volet « supprimer l'authentification locale »** — déjà fait (§0).
  Reste : retirer `password_hash`, retirer `bcryptjs`, corriger le README.

---

## 8. Décisions à ajouter au §14

Le §14 en compte vingt en v1.3. Quatre manquent, et elles conditionnent ce qui
précède.

21. **La frontière D3 interdit-elle le pattern BFF ?** HQ maintient un session
    store et un cookie chiffré au-dessus de Nola Auth. Reformuler la frontière ou
    retirer le pattern — mais le décider (§2).
22. **Le cycle de vie des demandes est-il fusionné dans `work_items` ?**
    Conditionne REQ-01, et donc l'ordre de tout le backlog (§3).
23. **Les six états d'ENG-09 remplacent-ils `WorkItemStatus` ?** La fusion
    `backlog`/`todo` a déjà été faite une fois ; la rouvrir demande une décision,
    pas une migration silencieuse (§4.3).
24. **L'ingestion se fait-elle sur l'EventBus, en HTTP, ou les deux ?** Deux
    chemins concurrents seraient le doublon suivant (§6.1).
