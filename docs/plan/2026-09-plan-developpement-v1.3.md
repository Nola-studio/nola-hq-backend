# Plan de développement — Nolaa HQ vers le référentiel v1.3

**Date :** 4 septembre 2026
**Base de code :** `nola-hq-backend@aa09c08`, `nola-hq@1b3ec36`
**Fondé sur :** l'audit `docs/audit/2026-09-referentiel-v1.3-audit.md`
**Hypothèse de capacité :** 1 à 2 développeurs. Les durées sont des ordres de
grandeur à ce rythme, pas des engagements.

---

## 1. Principe directeur

Le référentiel v1.3 demande deux choses qui, dans ce plan, n'en font qu'une :

1. **un registre des référentiels d'exécution** (EXE-01 à EXE-07) ;
2. **une séparation par domaine** (§4A, douze domaines avec leurs objets et leurs
   frontières).

Elles convergent parce que **le premier référentiel à ingérer est le v1.3
lui-même**. Le parser en extrait `Domaine → Capacité → Epic → User Story`. Les
douze domaines ne sont donc pas une table à saisir à la main : ils sont le
premier produit du registre.

```text
Référentiel v1.3 (document)
        ↓  EXE-01  registre + version + empreinte
        ↓  EXE-03  parsing
        ↓  EXE-04  Execution Manifest
        ↓  EXE-05  Draft Backlog
   ┌────┴────────────────────────────┐
   │                                 │
12 domaines + capacités        epics + stories en triage
(axe de navigation)            (backlog de la transformation)
```

**Conséquence pratique :** le plan ne demande jamais de ressaisir le référentiel
dans une interface. Chaque nouvelle version du document est rejouée par le même
chemin, et la synchronisation différentielle (EXE-06) évite de recréer ce qui
existe déjà.

---

## 2. La séparation par domaine

À livrer sur **trois niveaux distincts**, dans cet ordre. Les deux premiers ont
de la valeur immédiate ; le troisième est optionnel et arrive en dernier.

### 2.1 Régler d'abord le conflit de nommage

`studio_domains` désigne aujourd'hui les **noms de domaine Internet** (registrar,
date de renouvellement, prix, `auto_renew`). Le §4A appelle « Domaine » tout autre
chose : une zone permanente de responsabilité du groupe.

Deux objets, un seul mot — dans le même produit, la confusion est garantie dès la
première revue.

**Action, dans le tout premier lot :**

- renommer la table `studio_domains` → `internet_domains`, l'entité
  `StudioDomain` → `InternetDomain`, la route `/studio/domains` →
  `/products/internet-domains` ;
- le domaine fonctionnel prend le nom `domains` / `Domain`.

Ce renommage est de toute façon exigé par l'audit : `studio_domains` est l'amorce
d'IP-01 rangée dans le mauvais domaine (elle référence un projet, pas un produit).
Le faire maintenant coûte une migration ; le faire après IP-01 coûte une fusion.

### 2.2 Niveau 1 — Les données (le seul indispensable)

Deux tables, et une paire de colonnes sur les objets existants.

```ts
// src/domains/domain.entity.ts
@Entity('domains')
export class Domain {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** `D01`..`D12` — stable, jamais réattribué. */
  @Column({ type: 'varchar', length: 8, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'text', nullable: true }) purpose!: string | null;
  /** Email du propriétaire — décision §14.2 du référentiel. */
  @Column({ type: 'varchar', length: 160, nullable: true }) owner!: string | null;
  @Column({ type: 'integer', default: 0 }) position!: number;
  @Column({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'updated_at' }) updatedAt!: Date;
}

// src/domains/capability.entity.ts
@Entity('capabilities')
export class Capability {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** `D06.C05` — préfixé par le domaine, stable. */
  @Column({ type: 'varchar', length: 16, unique: true }) code!: string;
  @Column({ type: 'uuid', name: 'domain_id' }) @Index() domainId!: string;
  @Column({ type: 'varchar', length: 160 }) name!: string;
  @Column({ type: 'varchar', length: 160, nullable: true }) owner!: string | null;
  @Column({ type: 'integer', default: 0 }) position!: number;
  @Column({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'updated_at' }) updatedAt!: Date;
}
```

Puis `domain_id` et `capability_id`, **nullables**, sur les objets qui existent
déjà : `work_items`, `roadmap_initiatives`, `roadmap_objectives`, `products`,
`tickets`, `project_risks`, `business_contracts`. Nullables parce qu'une colonne
obligatoire imposerait de classer 100 % de l'existant avant de livrer quoi que ce
soit ; le remplissage se fait ensuite, domaine par domaine.

C'est aussi ce que réclame le §2.3 du référentiel (« tout objet important doit
contenir domaine et capacité »).

### 2.3 Niveau 2 — La navigation

Les huit groupes actuels de `Shell.tsx` ne correspondent à aucun domaine, et le
plus gros — « Clients & revenus », huit entrées — est un fourre-tout qui mêle D7
(clients), D8 (finance) et D4 (plans produit).

Remplacement proposé, à partir des 42 écrans existants :

| Groupe de navigation | Écrans actuels |
|---|---|
| **Vue d'ensemble** *(transverse)* | Dashboard, Flux d'activité |
| **D1 · Groupe et gouvernance** | Entreprises, Audit |
| **D2 · Organisations** | *(vide — à créer par ORG-01)* |
| **D3 · Personnes et accès** | Équipe, Annuaire, Auth |
| **D4 · Produits et PI** | Apps, Modules, Plans, Domaines Internet *(renommé)* |
| **D5 · Stratégie** | Roadmap, Analytics |
| **D6 · Projets et ingénierie** | Projets, Studio, Tâches, **Triage** *(ex-Demandes)*, Déploiements |
| **D7 · Clients et commercial** | Tenants, Pipeline, Onboarding, Gestion business, Devis, Contrats, Factures projets, Recouvrement |
| **D8 · Finance** | Vue financière, Abonnements, Mobile Money, Dépenses |
| **D9 · Support et exploitation** | Tickets, Health, Infra, Logs, Notifications, NPS |
| **D10 · Marketing** | Communications |
| **D11 · Juridique et risques** | *(vide — à créer par RSK-01)* |
| **D12 · Documentation et savoir** | **Référentiels** *(nouveau)* |

Deux groupes naissent vides. **C'est voulu et c'est utile :** un domaine sans
écran est la façon la plus lisible de montrer à la direction ce qui n'existe pas
encore. Un libellé « à construire » vaut mieux qu'une absence silencieuse.

Le mécanisme est déjà en place : `NAV` est une simple table de groupes dans
`Shell.tsx`, `routeIdForPath` et `navIdForRoute` gèrent déjà le mapping id ⇄ URL.
La bascule est un remaniement de tableau, pas une refonte.

### 2.4 Niveau 3 — Le code, et pourquoi il vient en dernier

Un découpage `src/domains/d06-engineering/...` est tentant. **À ne pas faire
maintenant :** déplacer 40 modules casse le `git blame`, invalide toutes les
branches en cours, et touche chaque import du dépôt — pour zéro valeur
utilisateur.

Version légère recommandée, à faire en même temps que le niveau 1 : chaque module
déclare son domaine, et un test vérifie que la carte est complète.

```ts
// src/common/domain-map.ts
export const MODULE_DOMAIN: Record<string, DomainCode> = {
  company: 'D01', audit: 'D01', activity: 'D01',
  team: 'D03', directory: 'D03', iam: 'D03', auth: 'D03', assist: 'D03',
  apps: 'D04', modules: 'D04', plans: 'D04',
  roadmap: 'D05', analytics: 'D05',
  'work-items': 'D06', studio: 'D06',
  business: 'D07', pipeline: 'D07', tenants: 'D07', verify: 'D07',
  invoices: 'D08', subscriptions: 'D08', momo: 'D08',
  tickets: 'D09', sla: 'D09', health: 'D09', infra: 'D09',
  logs: 'D09', notifications: 'D09', push: 'D09',
  broadcast: 'D10',
  manifest: 'D12', config: 'D12', 'execution-references': 'D12',
};
```

**L'exercice de cartographie est lui-même un résultat.** Trois modules refusent
d'entrer dans une seule case, et chacun signale un vrai problème de périmètre :

- `deploys` est à cheval sur D6 (livraison) et D9 (exploitation) — c'est la
  frontière que REL-03 devra trancher ;
- `momo` est à cheval sur D7 (encaissement client) et D8 (flux financiers) — le
  §6 tranche déjà : les paiements sont canoniques chez K-river, HQ n'en garde
  que la vue de gestion, donc D8 ;
- `broadcast` est à cheval sur D9 (communication de service) et D10 (marketing) —
  à trancher avec MKT-01.

Le déplacement physique des dossiers, s'il est décidé un jour, se fera domaine par
domaine, après que la carte ait vécu quelques mois.

---

## 3. Chantier 1 — Le registre des référentiels

Le point de départ demandé. Six lots, environ quatorze semaines, chacun livrable
et utile seul.

### Lot 1.0 — Socle domaine · ~1 semaine

- migration `domains` + `capabilities` ;
- seed des 12 domaines (codes `D01`..`D12`, noms et finalités repris du §4A) ;
- `domain_id` / `capability_id` nullables sur les sept tables listées en §2.2 ;
- `MODULE_DOMAIN` + test de complétude ;
- renommage `studio_domains` → `internet_domains` (§2.1) ;
- `GET /domains`, `GET /domains/:code/capabilities`.

*Livrable visible :* aucun écran. C'est le socle des cinq lots suivants et de la
navigation.

### Lot 1.1 — Registre des référentiels (EXE-01) · ~3 semaines

Deux tables. L'original est **immuable** : une nouvelle version crée une ligne,
elle n'écrase jamais la précédente — exigence explicite d'EXE-01.

```ts
@Entity('execution_references')
export class ExecutionReference {
  @PrimaryGeneratedColumn('uuid') id!: string;
  /** `REF-NOLAAHQ` — stable, sert de clé de rapprochement entre versions. */
  @Column({ type: 'varchar', length: 64, unique: true }) key!: string;
  @Column({ type: 'varchar', length: 200 }) title!: string;
  @Column({ type: 'uuid', name: 'domain_id', nullable: true }) domainId!: string | null;
  @Column({ type: 'uuid', name: 'product_id', nullable: true }) productId!: string | null;
  @Column({ type: 'uuid', name: 'project_id', nullable: true }) projectId!: string | null;
  /** `internal` | `product` | `partner` — d'où vient le document. */
  @Column({ type: 'varchar', length: 24, default: 'internal' }) origin!: ExecutionReferenceOrigin;
  @Column({ type: 'varchar', length: 160 }) owner!: string;
  @Column({ type: 'uuid', name: 'current_version_id', nullable: true }) currentVersionId!: string | null;
  @Column({ name: 'created_at' }) createdAt!: Date;
  @Column({ name: 'updated_at' }) updatedAt!: Date;
}

@Entity('execution_reference_versions')
export class ExecutionReferenceVersion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'reference_id' }) @Index() referenceId!: string;
  /** `1.3` — tel que déclaré par le document, pas un compteur interne. */
  @Column({ type: 'varchar', length: 32 }) version!: string;
  /** `received` → `parsed` → `validated` → `published` | `rejected`. */
  @Column({ type: 'varchar', length: 24, default: 'received' }) @Index() status!: ExecutionReferenceStatus;
  /** `markdown` | `json` | `yaml` — le format tel que reçu. */
  @Column({ type: 'varchar', length: 16 }) format!: ExecutionReferenceFormat;
  /** Le document original, jamais réécrit. */
  @Column({ type: 'text' }) content!: string;
  /** SHA-256 du contenu — l'empreinte d'intégrité exigée par EXE-01. */
  @Column({ type: 'varchar', length: 64, name: 'content_hash' }) @Index() contentHash!: string;
  @Column({ type: 'integer', name: 'size_bytes' }) sizeBytes!: number;
  @Column({ type: 'varchar', length: 160, name: 'received_from' }) receivedFrom!: string;
  @Column({ type: 'timestamp', name: 'received_at' }) receivedAt!: Date;
  @Column({ type: 'date', name: 'effective_date', nullable: true }) effectiveDate!: string | null;
  @Column({ type: 'varchar', length: 160, name: 'published_by', nullable: true }) publishedBy!: string | null;
  @Column({ type: 'timestamp', name: 'published_at', nullable: true }) publishedAt!: Date | null;
}
```

**Routes internes** (l'API publique attend le lot 1.6) :

```text
GET    /execution-references
POST   /execution-references              # crée la référence + sa v1
GET    /execution-references/:id
GET    /execution-references/:id/versions
POST   /execution-references/:id/versions # nouvelle version, jamais un écrasement
GET    /execution-references/:id/versions/:vid/content
```

**Règles :** taille maximale explicite (1 Mo suffit — le v1.3 fait ~90 Ko) ;
formats acceptés en liste blanche ; un `content_hash` identique à la version
courante est refusé en 409 plutôt que dupliqué ; création et publication tracées
par `AuditInterceptor`, déjà branché globalement.

**Écran** `/references` : liste, dépôt d'un fichier, historique des versions,
diff brut entre deux versions, empreinte affichée.

*À la fin du lot :* le v1.3 est dans HQ, versionné, avec son empreinte. Rien n'est
encore parsé — et c'est déjà la fin des « quelle version fait foi ? ».

### Lot 1.2 — Parsing et Execution Manifest (EXE-03 + EXE-04) · ~3 semaines

Le parser lit le Markdown et produit un manifest structuré. **Il ne crée aucun
objet opérationnel** — exigence explicite d'EXE-03.

```ts
@Entity('execution_manifests')
export class ExecutionManifest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'version_id', unique: true }) versionId!: string;
  /** Version du schéma de manifest, pas du document. */
  @Column({ type: 'varchar', length: 16, name: 'schema_version' }) schemaVersion!: string;
  @Column({ type: 'varchar', length: 24, default: 'draft' }) status!: ExecutionManifestStatus;
  @Column({ type: 'simple-json', name: 'validation_report', default: '{}' })
  validationReport!: { errors: ManifestIssue[]; warnings: ManifestIssue[] };
  @Column({ name: 'created_at' }) createdAt!: Date;
}

@Entity('execution_manifest_items')
export class ExecutionManifestItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', name: 'manifest_id' }) @Index() manifestId!: string;
  /** `domain` | `capability` | `objective` | `initiative` | `epic` | `story` | `task` | `risk` | `decision`. */
  @Column({ type: 'varchar', length: 24 }) kind!: ManifestItemKind;
  /** Clé stable extraite du document — `EXE-05`, `D06`, `US-ENG-014`. */
  @Column({ type: 'varchar', length: 64, name: 'source_key' }) @Index() sourceKey!: string;
  @Column({ type: 'uuid', name: 'parent_item_id', nullable: true }) parentItemId!: string | null;
  @Column({ type: 'varchar', length: 300 }) title!: string;
  @Column({ type: 'text', nullable: true }) body!: string | null;
  @Column({ type: 'varchar', length: 4, nullable: true }) priority!: string | null;
  /** Provenance : l'ancre de section et l'empreinte de l'extrait source. */
  @Column({ type: 'varchar', length: 200, name: 'source_section_id' }) sourceSectionId!: string;
  @Column({ type: 'varchar', length: 64, name: 'source_excerpt_hash' }) sourceExcerptHash!: string;
  @Column({ type: 'simple-json', default: '{}' }) meta!: Record<string, unknown>;
}
```

Le parser vit dans un fichier pur, sans dépendance Nest ni base — c'est déjà
l'idiome du dépôt (`work-items.board.ts`, `momo.summary.ts`, `sla-elapsed.ts`),
et c'est ce qui le rend testable sur le v1.3 réel comme fixture.

Ce que le parser doit reconnaître sur ce document précis : les titres
`# Domaine N — …`, `### Capacité N.N — …`, `#### EPIC XXX-NN — …`, les lignes
`**Priorité : P0**`, les listes numérotées sous `User stories :`, les blocs
`Critères d'acceptation`, et les tableaux du §9.

**Routes :** `POST /execution-references/:id/versions/:vid/parse`,
`GET …/manifest`, `GET …/validation-report`.

**Écran :** l'arbre du manifest, les champs manquants signalés, chaque nœud
renvoyant à sa section source.

*À la fin du lot :* le v1.3 est lu par la machine. Les 12 domaines, leurs
capacités et les ~60 epics sont visibles en arbre — sans qu'un seul objet
opérationnel n'ait été créé.

### Lot 1.3 — Draft Backlog et triage (EXE-05 + REQ-01) · ~3 semaines

Le lot le plus rentable : il livre à la fois la génération de backlog **et** la
refonte des demandes que l'audit place en tête. Les deux ont besoin exactement du
même socle.

**a. Le socle de provenance, sur `work_items`**

```ts
@Column({ type: 'varchar', length: 16, name: 'source_kind', default: 'manual' })
sourceKind!: 'manual' | 'request' | 'manifest' | 'support' | 'github';
@Column({ type: 'varchar', length: 64, name: 'source_ref_id', nullable: true }) sourceRefId!: string | null;
@Column({ type: 'varchar', length: 160, name: 'source_author', nullable: true }) sourceAuthor!: string | null;
@Column({ type: 'varchar', length: 64, name: 'source_excerpt_hash', nullable: true }) sourceExcerptHash!: string | null;
@Column({ type: 'varchar', length: 32, name: 'generation_method', default: 'manual' }) generationMethod!: string;
@Column({ type: 'varchar', length: 24, name: 'validation_status', default: 'accepted' }) validationStatus!: string;
@Column({ type: 'varchar', length: 160, name: 'approved_by', nullable: true }) approvedBy!: string | null;
```

**b. Le statut `triage` ne s'applique qu'aux lots générés par une machine.**

Un humain qui saisit un besoin écrit **directement dans le backlog** : un champ,
un enregistrement, l'item est un `work_item` en `todo` dès la première seconde. Il
n'y a **rien à convertir**, parce qu'il n'y a jamais eu deux objets. Personne ne
clique pour « accepter » ce qu'un collègue a écrit.

`triage` sert au seul cas où une validation humaine est réellement exigée : un
manifest qui déverse soixante items d'un coup (EXE-05 — « aucune mutation
importante sans respecter les règles d'approbation »). Là, un gate a un sens ;
sur une phrase tapée par un collègue, il n'en a aucun.

| Source | Statut d'arrivée | Clics avant d'être dans le backlog |
|---|---|---:|
| Humain (ex-« demande ») | `todo` | **0** |
| Ingestion support (event-bus) | `todo` | **0** |
| Manifest, lot de N items | `triage` | 1 pour le lot entier |

**c. La table `studio_requests` disparaît**, et avec elle l'écran. Capture à un
champ depuis n'importe où (palette de commandes, bouton du Kanban), déduction
automatique du type et de la priorité par la table
`REQUEST_PRIORITY_TO_TASK_PRIORITY` déjà écrite, projet et catégorie laissés nuls
— les deux colonnes le sont déjà sur `WorkItem`. `/studio/requests` redirige vers
le Kanban filtré sur `source_kind='request'` : « ce qui est arrivé cette semaine »
devient un filtre du backlog, pas une file séparée.

L'entrée de menu « Demandes » disparaît donc du domaine D6 à ce moment-là — elle
n'est conservée aujourd'hui que parce que l'écran existe encore.

**d. La prévisualisation du backlog** compare le manifest à l'existant et
annonce, comme l'exige EXE-05 : à créer, à modifier, inchangé, à déprécier,
conflits, dépendances nouvelles ou cassées, éléments déjà livrés affectés.

```text
POST /execution-references/:id/versions/:vid/backlog/preview
POST /execution-references/:id/versions/:vid/backlog/apply
```

`apply` écrit des `work_items` en `triage` avec `source_kind='manifest'` et la
provenance complète — c'est le seul chemin qui passe par un gate.

*À la fin du lot :* le v1.3 génère son propre backlog de transformation, et un
besoin saisi par l'équipe est un élément de backlog immédiatement. Un seul objet,
un seul tableau, un seul cycle de vie.

> **Le test de recette du lot.** Écrire un besoin et le voir dans le backlog doit
> coûter **un champ et une validation**. Si la recette demande un deuxième écran,
> une conversion ou une réassignation, le lot a manqué sa cible — le défaut de
> l'écran Demandes aurait simplement changé de nom.

### Lot 1.4 — Taxonomie complète (ENG-01) · ~3 semaines

Le manifest produit des `epic` et des `story` que `work_items` ne sait pas encore
représenter : `WorkItemType` vaut `bug | feature | task | ops | debt`.

- ajouter `epic`, `story`, `spike` à `WorkItemType` ;
- ajouter `parent_id` sur `work_items` pour la hiérarchie epic → story →
  sous-tâche ;
- relier `roadmap_initiatives` (scope `initiative`) au-dessus des epics ;
- trancher `RoadmapInitiative.scope` : soit deux entités, soit le champ documenté
  comme un discriminant assumé — mais décidé (audit §5).

*Note de séquence :* ce lot vient **après** le 1.3 délibérément. Le lot 1.3
fonctionne avec la taxonomie actuelle (un epic du manifest atterrit en `task`
étiquetée) ; l'inverse n'est pas vrai. Livrer 1.3 d'abord, c'est avoir la boucle
complète six semaines plus tôt.

### Lot 1.5 — Synchronisation différentielle et traçabilité (EXE-06 + EXE-07) · ~2 semaines

Quand une v1.4 arrive, le rapprochement se fait par `source_key`, jamais par
titre. États : `ADDED`, `MODIFIED`, `UNCHANGED`, `DEPRECATED`, `REMOVED`,
`CONFLICT`.

Règles non négociables du référentiel : une nouvelle version ne recrée pas les
mêmes epics ; un élément déjà livré n'est jamais supprimé silencieusement ; une
modification incompatible produit un conflit ou une décision explicite.

`GET /execution-references/:id/traceability` répond à « pourquoi cet élément de
backlog existe-t-il ? » en remontant la chaîne référentiel → version → section →
manifest → work item.

### Lot 1.6 — API publique d'ingestion (EXE-02) · ~2 semaines

Le dernier, pas le premier — ouvrir une API avant que le pipeline interne soit
éprouvé, c'est publier un contrat qu'on devra casser.

À ce stade il ne reste que la façade : OAuth 2.0 client credentials, scopes
(`execution-reference:read|write|parse|validate`, `backlog:preview|write|sync`),
quotas, clés d'idempotence, webhooks signés, OpenAPI versionné.

**Point d'attention (audit §6) :** `support-ingest.listener.ts` fait déjà de
l'ingestion, sur l'EventBus. Les deux transports doivent partager le même service
de normalisation, sinon HQ se retrouve avec deux chemins d'entrée concurrents —
soit exactement le type de doublon que ce plan cherche à supprimer.

---

## 4. Chantiers suivants

Une fois le chantier 1 livré, dans cet ordre.

| Chantier | Contenu | Durée | Pourquoi ici |
|---|---|---|---|
| **2 — GitHub** | ENG-06 *(à passer P0)*, puis ENG-08 `Start Work` | ~6 sem. | Aucune intégration n'existe. ENG-06 est la dépendance de quatre epics dont deux P0 ; il ne peut pas rester P1 au rang 16 |
| **3 — Organisation** | ORG-01 + HR-01 **ensemble** | ~5 sem. | La frontière D2/D3 n'a nulle part où se faire tant que `Équipe` et `Poste` n'existent pas |
| **4 — Release** | REL-00 *(nouveau)* puis REL-01/03 | ~4 sem. | Le registre applicatif est en mémoire ; `release.published` d'ENG-09 en dépend |
| **5 — Client canonique** | CRM-02 puis CRM-01 | ~5 sem. | `business_clients` et `tenants` n'ont aucune clé étrangère commune |
| **6 — Preuves** | ENG-09, ENG-11, puis ENG-10 | ~7 sem. | Dépend des chantiers 2 et 4. ENG-10 exige une table dédiée : `activity_events` ne peut porter ni clé de déduplication ni version de pondération |
| **7 — ITSM** | SUP-03 | ~4 sem. | Sept objets absents, pas trois statuts à séparer |

---

## 5. Séquence

```text
S1      ── Lot 1.0  socle domaine  ─────────┐
S2-S4   ── Lot 1.1  registre EXE-01         │  Chantier 1
S5-S7   ── Lot 1.2  parsing + manifest      │  le registre
S8-S10  ── Lot 1.3  draft backlog + triage  │  ~14 semaines
S11-S13 ── Lot 1.4  taxonomie ENG-01        │
S14-S15 ── Lot 1.5  sync différentiel       │
S16-S17 ── Lot 1.6  API publique  ──────────┘

        ── navigation par domaine : livrée avec le lot 1.0,
           enrichie à chaque lot (l'entrée « Référentiels »
           arrive avec 1.1, « Triage » avec 1.3)

S18+    ── chantiers 2 à 7
```

### Jalons de vérification

| Jalon | Comment on sait que c'est atteint |
|---|---|
| Fin lot 1.0 | La navigation affiche 12 domaines ; deux sont vides et le disent |
| Fin lot 1.1 | Le v1.3 est dans HQ, versionné, avec son empreinte SHA-256 |
| Fin lot 1.2 | L'arbre des 12 domaines et des ~60 epics est lisible à l'écran, sans saisie manuelle |
| Fin lot 1.3 | Un besoin saisi par l'équipe est dans le backlog en un champ, sans conversion ni deuxième écran |
| Fin lot 1.5 | Un v1.4 déposé ne recrée aucun epic existant |
| Fin chantier 1 | Depuis un `work_item`, on remonte à la ligne du référentiel qui l'a produit |

---

## 6. À décider avant d'écrire la première ligne

Quatre décisions bloquantes. Les trois premières sont dans le lot 1.0 ; la
quatrième conditionne le lot 1.3.

1. **Les codes de domaine `D01`..`D12` sont-ils définitifs ?** Ils deviennent des
   clés stables, référencées par les manifests et les URL. Les renuméroter plus
   tard casse la traçabilité.
2. **Qui possède chaque domaine ?** La décision §14.2 du référentiel. Sans
   propriétaire, `domains.owner` reste nul et la matrice RACI d'ORG-04 n'a rien
   sur quoi s'appuyer.
3. **Le renommage `studio_domains` → `internet_domains` est-il accepté ?**
   (§2.1 — une migration maintenant, une fusion plus tard.)
4. **Le cycle de vie des demandes est-il fusionné dans `work_items` ?**
   C'est la décision 22 de l'audit. Tout le lot 1.3 en dépend.

Deux autres décisions peuvent attendre le chantier concerné, mais ne doivent pas
être découvertes en cours de route : la frontière D3 sur le pattern BFF
(décision 21), et le remplacement éventuel de `WorkItemStatus` par les six états
d'ENG-09 (décision 23).
