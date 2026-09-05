import { describe, expect, test } from 'bun:test';
import { ALLOWED_PARENT_TYPES, checkParent, lineageOf, type HierarchyNode } from './work-item-hierarchy';
import { WORK_ITEM_TYPES } from './work-item.entity';

function node(id: number, type: HierarchyNode['type'], parentId: number | null = null): HierarchyNode {
  return { id, type, parentId };
}

/** Un petit arbre : epic 1 → story 2 → tâche 3, et un epic 10 isolé. */
const TREE = new Map<number, HierarchyNode>([
  [1, node(1, 'epic')],
  [2, node(2, 'story', 1)],
  [3, node(3, 'task', 2)],
  [10, node(10, 'epic')],
]);
const lookup = (id: number) => TREE.get(id) ?? null;

describe('règles de rattachement', () => {
  test('chaque type déclare ses parents autorisés', () => {
    expect(Object.keys(ALLOWED_PARENT_TYPES).sort()).toEqual([...WORK_ITEM_TYPES].sort());
  });

  test('une story se rattache à un epic', () => {
    expect(checkParent(node(99, 'story'), TREE.get(1)!, lookup)).toBeNull();
  });

  test('une tâche se rattache à un epic ou à une story', () => {
    expect(checkParent(node(99, 'task'), TREE.get(1)!, lookup)).toBeNull();
    expect(checkParent(node(99, 'task'), TREE.get(2)!, lookup)).toBeNull();
  });

  /** Un epic pend d'une initiative, pas d'un autre ticket. */
  test('un epic ne peut pas être rattaché à un work item', () => {
    const violation = checkParent(node(99, 'epic'), TREE.get(1)!, lookup);
    expect(violation?.kind).toBe('forbidden');
    expect(violation?.message).toContain('initiative');
  });

  test('une story ne peut pas être rattachée à une autre story', () => {
    expect(checkParent(node(99, 'story'), TREE.get(2)!, lookup)?.kind).toBe('forbidden');
  });

  test('détacher est toujours permis', () => {
    expect(checkParent(TREE.get(3)!, null, lookup)).toBeNull();
  });

  test('un élément ne peut pas être son propre parent', () => {
    expect(checkParent(TREE.get(2)!, TREE.get(2)!, lookup)?.kind).toBe('self');
  });
});

describe('cycles', () => {
  /**
   * Les règles de type forment déjà un graphe acyclique — epic → story →
   * tâche, sans arête retour — donc un cycle ne peut naître que de données
   * antérieures à la règle : un import, une migration, un epic qui porte un
   * parent qu'il n'aurait jamais dû avoir. C'est précisément ce cas que le
   * garde-fou attrape, et c'est ainsi qu'il faut l'éprouver.
   */
  test('un rattachement qui boucle via des données héritées est refusé', () => {
    const corrupted = new Map<number, HierarchyNode>([
      // Cet epic n'aurait jamais dû avoir de parent : la règle l'interdit
      // aujourd'hui, mais la ligne existe déjà en base.
      [1, node(1, 'epic', 3)],
      [2, node(2, 'story', 1)],
      [3, node(3, 'task')],
    ]);
    const look = (id: number) => corrupted.get(id) ?? null;
    const violation = checkParent(corrupted.get(3)!, corrupted.get(2)!, look);
    expect(violation?.kind).toBe('cycle');
    expect(violation?.message).toContain('cycle');
  });

  test('un cycle déjà présent en amont ne fait pas boucler la vérification', () => {
    const broken = new Map<number, HierarchyNode>([
      [1, node(1, 'story', 2)],
      [2, node(2, 'story', 1)],
      [7, node(7, 'task')],
    ]);
    const look = (id: number) => broken.get(id) ?? null;
    // Ne doit pas tourner à l'infini, et ne doit rien reprocher à ce lien-ci.
    expect(checkParent(broken.get(7)!, broken.get(1)!, look)).toBeNull();
  });

  test('un parent disparu termine la chaîne au lieu de lever une erreur', () => {
    const orphan = new Map<number, HierarchyNode>([[5, node(5, 'story', 404)]]);
    const look = (id: number) => orphan.get(id) ?? null;
    expect(checkParent(node(99, 'task'), orphan.get(5)!, look)).toBeNull();
  });
});

describe('lignée', () => {
  test('remonte la chaîne, le plus proche d’abord', () => {
    expect(lineageOf(TREE.get(3)!, lookup).map((n) => n.id)).toEqual([2, 1]);
  });

  test('un élément sans parent a une lignée vide', () => {
    expect(lineageOf(TREE.get(10)!, lookup)).toEqual([]);
  });

  test('une lignée circulaire s’arrête au lieu de boucler', () => {
    const broken = new Map<number, HierarchyNode>([
      [1, node(1, 'story', 2)],
      [2, node(2, 'story', 1)],
    ]);
    const look = (id: number) => broken.get(id) ?? null;
    expect(lineageOf(broken.get(1)!, look).length).toBeLessThanOrEqual(2);
  });
});
