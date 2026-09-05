import { describe, expect, test } from 'bun:test';
import { buildHierarchy, type HierarchyEpic, type HierarchyNode, type HierarchyRefs } from './hierarchy';

/**
 * L'arbre du référentiel : Domaine › Capacité › Objectif › Initiative › Epic.
 *
 * Ce qui se joue ici n'est pas l'affichage mais le placement — et surtout ce
 * qui arrive quand le référentiel ne renseigne pas tout. Un arbre qui
 * inventerait un objectif pour tenir cinq niveaux dirait quelque chose de
 * faux à chaque ligne.
 */

const REFS: HierarchyRefs = {
  domains: [
    { id: 'd-gov', code: 'D01', name: 'Groupe et gouvernance', position: 0 },
    { id: 'd-eng', code: 'D06', name: 'Projets et ingénierie', position: 5 },
  ],
  capabilities: [
    { id: 'c-conf', code: 'D01.C01', name: 'Conformité réglementaire', domainId: 'd-gov' },
    { id: 'c-qual', code: 'D06.C02', name: 'Qualité logicielle', domainId: 'd-eng' },
  ],
  objectives: [{ id: 'o-reg', title: 'Registre légal fiable', domainId: 'd-gov', capabilityId: 'c-conf' }],
  initiatives: [
    { id: 'i-conf', title: 'Mise en conformité 2026', keyPrefix: 'CONF', objectiveId: 'o-reg' },
    { id: 'i-orphan', title: 'Chantier sans objectif', keyPrefix: 'ORP', objectiveId: null },
  ],
};

function epic(over: Partial<HierarchyEpic> = {}): HierarchyEpic {
  return {
    id: 1,
    reference: 'GOV-01',
    title: 'Structure juridique du groupe',
    domainId: 'd-gov',
    capabilityId: 'c-conf',
    projectId: 'i-conf',
    progress: { total: 0, done: 0, inProgress: 0 },
    ...over,
  };
}

/** Les libellés du chemin le plus profond, pour lire un arbre en une ligne. */
function path(nodes: HierarchyNode[], acc: string[] = []): string[] {
  const node = nodes[0];
  if (!node) return acc;
  return path(node.children, [...acc, `${node.kind}:${node.code ?? node.title}`]);
}

describe('le chemin d’un epic', () => {
  test('les cinq niveaux quand le référentiel les porte tous', () => {
    const tree = buildHierarchy([epic()], REFS);
    expect(path(tree)).toEqual([
      'domain:D01',
      'capability:D01.C01',
      'objective:Registre légal fiable',
      'initiative:CONF',
      'epic:GOV-01',
    ]);
  });

  /**
   * Le cas courant aujourd'hui : les documents déposent domaine et capacité,
   * personne n'a encore relié objectif ni initiative. Les maillons manquants
   * se referment — trois niveaux vrais valent mieux que cinq dont deux
   * inventés.
   */
  test('sans objectif ni initiative, l’arbre se referme sur trois niveaux', () => {
    const tree = buildHierarchy([epic({ projectId: null })], REFS);
    expect(path(tree)).toEqual(['domain:D01', 'capability:D01.C01', 'epic:GOV-01']);
  });

  test('une initiative sans objectif reste un niveau, sous la capacité de l’epic', () => {
    const tree = buildHierarchy([epic({ projectId: 'i-orphan' })], REFS);
    expect(path(tree)).toEqual([
      'domain:D01',
      'capability:D01.C01',
      'initiative:ORP',
      'epic:GOV-01',
    ]);
  });

  test('sans capacité, l’epic pend directement au domaine', () => {
    const tree = buildHierarchy([epic({ capabilityId: null, projectId: null })], REFS);
    expect(path(tree)).toEqual(['domain:D01', 'epic:GOV-01']);
  });

  /**
   * Un epic qu'aucun domaine ne réclame doit rester visible : le ranger sous
   * le premier domaine venu inventerait un rattachement, le cacher masquerait
   * le travail de classement qui reste à faire.
   */
  test('un epic sans rien est nommé, pas caché ni deviné', () => {
    const tree = buildHierarchy(
      [epic({ domainId: null, capabilityId: null, projectId: null })],
      REFS,
    );
    expect(path(tree)).toEqual(['domain:Hors référentiel', 'epic:GOV-01']);
  });

  /** Le domaine se rattrape par la capacité quand l'epic ne le dit pas. */
  test('la capacité donne son domaine à l’epic qui n’en déclare pas', () => {
    const tree = buildHierarchy([epic({ domainId: null, projectId: null })], REFS);
    expect(path(tree)).toEqual(['domain:D01', 'capability:D01.C01', 'epic:GOV-01']);
  });

  /** Une référence inconnue vaut absence : on ne fabrique pas le maillon. */
  test('un projet inconnu ne crée pas d’initiative fantôme', () => {
    const tree = buildHierarchy([epic({ projectId: 'i-disparue' })], REFS);
    expect(path(tree)).toEqual(['domain:D01', 'capability:D01.C01', 'epic:GOV-01']);
  });
});

describe('ce que l’arbre montre', () => {
  /** Une capacité sans epic n'est pas un dossier vide où l'on clique pour rien. */
  test('les niveaux sans travail n’apparaissent pas', () => {
    const tree = buildHierarchy([epic()], REFS);
    expect(tree).toHaveLength(1);
    expect(tree[0].code).toBe('D01');
  });

  test('les domaines sortent dans l’ordre du référentiel', () => {
    const tree = buildHierarchy(
      [
        epic({ id: 2, reference: 'ENG-01', domainId: 'd-eng', capabilityId: 'c-qual', projectId: null }),
        epic({ id: 1, projectId: null }),
      ],
      REFS,
    );
    expect(tree.map((n) => n.code)).toEqual(['D01', 'D06']);
  });

  /** Le reste passe en queue : c'est un reste, pas un treizième domaine. */
  test('« Hors référentiel » ferme la marche', () => {
    const tree = buildHierarchy(
      [
        epic({ id: 2, domainId: null, capabilityId: null, projectId: null }),
        epic({ id: 1, projectId: null }),
      ],
      REFS,
    );
    expect(tree.map((n) => n.title)).toEqual(['Groupe et gouvernance', 'Hors référentiel']);
  });
});

describe('l’avancement', () => {
  const withProgress = (over: Partial<HierarchyEpic>, p: [number, number, number]) =>
    epic({ ...over, progress: { total: p[0], done: p[1], inProgress: p[2] } });

  test('il remonte à chaque niveau', () => {
    const tree = buildHierarchy(
      [
        withProgress({ id: 1, reference: 'GOV-01' }, [4, 2, 1]),
        withProgress({ id: 2, reference: 'GOV-02' }, [6, 1, 0]),
      ],
      REFS,
    );
    expect(tree[0].progress).toEqual({ total: 10, done: 3, inProgress: 1 });
    expect(tree[0].epicCount).toBe(2);
  });

  /**
   * Un epic sans enfant compte pour un epic mais pour zéro ticket : `0/0`
   * veut dire « pas découpé », pas « rien de fait », et une moyenne qui le
   * compterait comme un échec ferait plonger le domaine entier.
   */
  test('un epic non découpé ne fait pas baisser le domaine', () => {
    const tree = buildHierarchy(
      [
        withProgress({ id: 1, reference: 'GOV-01' }, [2, 2, 0]),
        withProgress({ id: 2, reference: 'GOV-02' }, [0, 0, 0]),
      ],
      REFS,
    );
    expect(tree[0].progress).toEqual({ total: 2, done: 2, inProgress: 0 });
    expect(tree[0].epicCount).toBe(2);
  });
});

describe('les clés', () => {
  /** Deux niveaux peuvent partager un identifiant : la clé les sépare. */
  test('elles distinguent les niveaux entre eux', () => {
    const tree = buildHierarchy([epic()], REFS);
    const keys: string[] = [];
    (function walk(nodes: HierarchyNode[]) {
      for (const n of nodes) {
        keys.push(n.key);
        walk(n.children);
      }
    })(tree);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
