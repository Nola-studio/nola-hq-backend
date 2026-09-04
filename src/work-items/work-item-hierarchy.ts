import type { WorkItemType } from './work-item.entity';

/**
 * The taxonomy's shape rules (ENG-01, §2.1 of the referential).
 *
 * Pure — no Nest, no database — like `work-items.board.ts` and
 * `execution-reference.parser.ts`. The rules are the interesting part and they
 * deserve to be readable and testable on their own.
 *
 * The referential nests work as:
 *
 *     Epic
 *     ├── User Story
 *     │   └── Sous-tâches
 *     ├── Tâche
 *     ├── Bug
 *     └── Spike
 *
 * so an epic is the ceiling: it hangs off an initiative and a capability, not
 * off another work item. Everything else may hang off an epic, and the
 * task-shaped types may also hang off a story — that is what "sous-tâches"
 * means when the child is real work rather than a checklist line.
 */
export const ALLOWED_PARENT_TYPES: Record<WorkItemType, readonly WorkItemType[]> = {
  /** An epic's parent is an initiative, not a work item. */
  epic: [],
  story: ['epic'],
  task: ['epic', 'story'],
  bug: ['epic', 'story'],
  spike: ['epic', 'story'],
  // The three historic types predate the taxonomy. They behave like tasks
  // rather than getting a rule of their own, so nothing that used to be
  // fileable stops being fileable.
  feature: ['epic', 'story'],
  ops: ['epic', 'story'],
  debt: ['epic', 'story'],
};

export type HierarchyViolation =
  | { kind: 'self'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'cycle'; message: string; path: number[] };

/** Minimal shape the rules need — decoupled from the entity. */
export interface HierarchyNode {
  id: number;
  type: WorkItemType;
  parentId: number | null;
}

const TYPE_LABELS: Record<WorkItemType, string> = {
  epic: 'epic',
  story: 'user story',
  task: 'tâche',
  bug: 'bug',
  spike: 'spike',
  feature: 'évolution',
  ops: 'exploitation',
  debt: 'dette',
};

function describe(type: WorkItemType): string {
  return TYPE_LABELS[type] ?? type;
}

/**
 * Checks that `child` may hang off `parent`.
 *
 * `ancestors` resolves a work item id to its node, so the cycle check can walk
 * upward. It returns `null` when the id is unknown, which is treated as the
 * end of the chain rather than an error: a parent that vanished is a broken
 * link to repair, not a cycle.
 *
 * Returns `null` when the move is legal.
 */
export function checkParent(
  child: HierarchyNode,
  parent: HierarchyNode | null,
  ancestors: (id: number) => HierarchyNode | null,
): HierarchyViolation | null {
  if (parent === null) return null;

  if (parent.id === child.id) {
    return { kind: 'self', message: 'Un élément ne peut pas être son propre parent.' };
  }

  const allowed = ALLOWED_PARENT_TYPES[child.type] ?? [];
  if (!allowed.includes(parent.type)) {
    const expected =
      allowed.length === 0
        ? "aucun élément parent — un epic se rattache à une initiative, pas à un autre ticket"
        : allowed.map(describe).join(' ou ');
    return {
      kind: 'forbidden',
      message: `Un ${describe(child.type)} ne peut pas être rattaché à un ${describe(parent.type)} : ${expected}.`,
    };
  }

  // Walking up from the *proposed* parent must never reach the child.
  const path: number[] = [parent.id];
  const seen = new Set<number>([parent.id]);
  let cursor = parent.parentId;
  while (cursor !== null) {
    if (cursor === child.id) {
      return {
        kind: 'cycle',
        message: `Ce rattachement créerait un cycle (${[...path, child.id].join(' → ')}).`,
        path: [...path, child.id],
      };
    }
    if (seen.has(cursor)) break; // pre-existing cycle upstream — not this move's doing
    seen.add(cursor);
    path.push(cursor);
    cursor = ancestors(cursor)?.parentId ?? null;
  }

  return null;
}

/**
 * The chain of ancestors, nearest first. Stops on a missing link or a
 * pre-existing cycle rather than looping — a lineage read must never hang on
 * data that is already broken.
 */
export function lineageOf(node: HierarchyNode, ancestors: (id: number) => HierarchyNode | null): HierarchyNode[] {
  const chain: HierarchyNode[] = [];
  const seen = new Set<number>([node.id]);
  let cursor = node.parentId;
  while (cursor !== null) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const parent = ancestors(cursor);
    if (!parent) break;
    chain.push(parent);
    cursor = parent.parentId;
  }
  return chain;
}
