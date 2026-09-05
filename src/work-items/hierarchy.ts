/**
 * L'arbre du référentiel : Domaine › Capacité › Objectif › Initiative › Epic.
 *
 * Les cinq niveaux existent bel et bien en base — `capabilities.domain_id`,
 * `roadmap_objectives.capability_id`, `roadmap_initiatives.objective_id`, et
 * `work_items.project_id` qui pointe l'initiative — mais aucune vue ne les
 * remontait ensemble : on voyait les epics par domaine, et rien entre les
 * deux.
 *
 * Fonction pure, sans base : c'est ici que se jouent les décisions de
 * placement, et elles s'éprouvent mieux sur des tableaux que sur un schéma.
 *
 * La règle tient en une phrase : **chaque epic remonte sa propre chaîne, et
 * les maillons manquants se referment**. Un référentiel qui ne renseigne ni
 * objectif ni initiative rend donc Domaine › Capacité › Epic — trois niveaux
 * vrais plutôt que cinq dont deux inventés. Rien n'est déduit : un epic sans
 * domaine finit sous « Hors référentiel », pas sous le premier domaine venu.
 */

export const HIERARCHY_KINDS = ['domain', 'capability', 'objective', 'initiative', 'epic'] as const;
export type HierarchyKind = (typeof HIERARCHY_KINDS)[number];

/** L'avancement, tel que la vue Epics le compte déjà — mêmes nombres. */
export interface HierarchyProgress {
  total: number;
  done: number;
  inProgress: number;
}

export interface HierarchyNode {
  kind: HierarchyKind;
  /** `d:<uuid>`, `e:<id>`… — unique dans tout l'arbre, y compris entre niveaux. */
  key: string;
  /** L'identifiant de l'objet lui-même, pour ouvrir ce qu'il désigne. */
  id: string;
  /** `D06`, `D06.C03`, `ORG-01` — nul quand l'objet n'en porte pas. */
  code: string | null;
  title: string;
  /** Les epics de ce sous-arbre. Sur un epic : 1. */
  epicCount: number;
  /** Somme de l'avancement des epics portés. */
  progress: HierarchyProgress;
  children: HierarchyNode[];
}

export interface HierarchyEpic {
  id: number;
  reference: string | null;
  title: string;
  domainId: string | null;
  capabilityId: string | null;
  /** Pointe une `roadmap_initiatives.id` — c'est le « projet » du ticket. */
  projectId: string | null;
  progress: HierarchyProgress;
}

export interface HierarchyRefs {
  domains: { id: string; code: string; name: string; position: number }[];
  capabilities: { id: string; code: string; name: string; domainId: string }[];
  objectives: { id: string; title: string; domainId: string | null; capabilityId: string | null }[];
  initiatives: { id: string; title: string; keyPrefix: string | null; objectiveId: string | null }[];
}

/** Le seau des epics qu'aucun domaine ne réclame — nommé, jamais caché. */
export const UNPLACED = { id: 'unplaced', code: null, title: 'Hors référentiel' } as const;

interface Draft {
  kind: HierarchyKind;
  key: string;
  id: string;
  code: string | null;
  title: string;
  /** Ce qui ordonne les frères : position du domaine, puis code, puis titre. */
  rank: [number, string, string];
  children: Map<string, Draft>;
  epics: HierarchyEpic[];
}

function draft(kind: HierarchyKind, id: string, code: string | null, title: string, rank: [number, string, string]): Draft {
  return { kind, key: `${kind[0]}:${id}`, id, code, title, rank, children: new Map(), epics: [] };
}

/**
 * Construit l'arbre à partir des epics et des tables du référentiel.
 *
 * Un niveau qui ne porte aucun epic n'apparaît pas : cette vue répond à « où
 * se trouve le travail », pas « quelles cases existent ». Une capacité vide
 * s'y lirait comme un dossier vide dans lequel on cliquerait pour rien.
 */
export function buildHierarchy(epics: HierarchyEpic[], refs: HierarchyRefs): HierarchyNode[] {
  const domains = new Map(refs.domains.map((d) => [d.id, d]));
  const capabilities = new Map(refs.capabilities.map((c) => [c.id, c]));
  const objectives = new Map(refs.objectives.map((o) => [o.id, o]));
  const initiatives = new Map(refs.initiatives.map((i) => [i.id, i]));

  const roots = new Map<string, Draft>();

  for (const epic of epics) {
    /**
     * La chaîne se remonte depuis l'epic, pas depuis le domaine : c'est lui
     * qui sait à quoi il est rattaché, et lui seul empêche d'accrocher un
     * niveau qui ne le réclame pas.
     */
    const initiative = epic.projectId ? initiatives.get(epic.projectId) ?? null : null;
    const objective = initiative?.objectiveId ? objectives.get(initiative.objectiveId) ?? null : null;
    const capability =
      (epic.capabilityId ? capabilities.get(epic.capabilityId) : undefined) ??
      (objective?.capabilityId ? capabilities.get(objective.capabilityId) : undefined) ??
      null;
    const domain =
      (epic.domainId ? domains.get(epic.domainId) : undefined) ??
      (capability ? domains.get(capability.domainId) : undefined) ??
      (objective?.domainId ? domains.get(objective.domainId) : undefined) ??
      null;

    const path: Draft[] = [];
    path.push(
      domain
        ? draft('domain', domain.id, domain.code, domain.name, [domain.position, domain.code, domain.name])
        : // Sans domaine, le seau passe en dernier : c'est un reste, pas un D00.
          draft('domain', UNPLACED.id, UNPLACED.code, UNPLACED.title, [Number.MAX_SAFE_INTEGER, 'ZZ', UNPLACED.title]),
    );
    if (capability) {
      path.push(draft('capability', capability.id, capability.code, capability.name, [0, capability.code, capability.name]));
    }
    if (objective) {
      path.push(draft('objective', objective.id, null, objective.title, [0, '', objective.title]));
    }
    if (initiative) {
      path.push(
        draft('initiative', initiative.id, initiative.keyPrefix, initiative.title, [
          0,
          initiative.keyPrefix ?? '',
          initiative.title,
        ]),
      );
    }

    let level = roots;
    let node: Draft | undefined;
    for (const step of path) {
      node = level.get(step.key);
      if (!node) {
        node = step;
        level.set(step.key, step);
      }
      level = node.children;
    }
    // `node` est le maillon le plus profond de la chaîne — au minimum le domaine.
    node!.epics.push(epic);
  }

  return [...roots.values()].sort(byRank).map(toNode);
}

function byRank(a: Draft, b: Draft): number {
  return (
    a.rank[0] - b.rank[0] ||
    a.rank[1].localeCompare(b.rank[1]) ||
    a.rank[2].localeCompare(b.rank[2])
  );
}

function toNode(d: Draft): HierarchyNode {
  const children = [
    ...[...d.children.values()].sort(byRank).map(toNode),
    ...d.epics
      .slice()
      .sort((a, b) => (a.reference ?? '').localeCompare(b.reference ?? '') || a.id - b.id)
      .map(epicNode),
  ];
  return {
    kind: d.kind,
    key: d.key,
    id: d.id,
    code: d.code,
    title: d.title,
    epicCount: children.reduce((n, c) => n + c.epicCount, 0),
    progress: children.reduce(sumProgress, { total: 0, done: 0, inProgress: 0 }),
    children,
  };
}

function epicNode(epic: HierarchyEpic): HierarchyNode {
  return {
    kind: 'epic',
    key: `e:${epic.id}`,
    id: String(epic.id),
    code: epic.reference,
    title: epic.title,
    epicCount: 1,
    progress: epic.progress,
    children: [],
  };
}

function sumProgress(acc: HierarchyProgress, node: HierarchyNode): HierarchyProgress {
  return {
    total: acc.total + node.progress.total,
    done: acc.done + node.progress.done,
    inProgress: acc.inProgress + node.progress.inProgress,
  };
}
