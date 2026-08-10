import type { WorkItemStatus } from './work-item.entity';

/**
 * Pure reorder-planning for work items — no Nest/DB deps, ported verbatim
 * from `roadmap.board.ts`'s `planMove` (same algorithm, retyped for
 * `WorkItemStatus`/integer id). `WorkItemsService.move()` used to just
 * append via `count()`, never re-densifying sibling positions — this
 * closes that gap so drag/drop behaves the same as Roadmap's and Studio's
 * boards did.
 */

/** Minimal shape the reorder plan needs (decoupled from the entity). */
export interface BoardWorkItem {
  id: number;
  status: string;
  position: number;
}

/** Position/status a `move` must persist for one work item. */
export interface WorkItemPlacement {
  id: number;
  status: WorkItemStatus;
  position: number;
}

/**
 * Computes the placements to persist when `movedId` lands at
 * `targetPosition` in the `targetStatus` column.
 *
 * The target column is re-densified (0..n-1) around the inserted item and,
 * on a cross-column move, so is the source column — no gaps, no duplicate
 * ranks. `targetPosition` is clamped to the column bounds, so an
 * out-of-range value appends instead of failing.
 *
 * Returns **only** what actually changed, so the service writes the minimum.
 */
export function planMove<T extends BoardWorkItem>(
  all: T[],
  movedId: number,
  targetStatus: WorkItemStatus,
  targetPosition: number,
): WorkItemPlacement[] {
  const moved = all.find((i) => i.id === movedId);
  if (!moved) return [];
  const sourceStatus = moved.status;

  const target = all
    .filter((i) => i.status === targetStatus && i.id !== movedId)
    .sort(byPosition);
  const index = Math.min(Math.max(Math.trunc(targetPosition), 0), target.length);
  target.splice(index, 0, moved);

  const changes: WorkItemPlacement[] = [];
  target.forEach((item, position) => {
    if (item.status !== targetStatus || item.position !== position) {
      changes.push({ id: item.id, status: targetStatus, position });
    }
  });

  if (sourceStatus !== targetStatus) {
    all
      .filter((i) => i.status === sourceStatus && i.id !== movedId)
      .sort(byPosition)
      .forEach((item, position) => {
        if (item.position !== position) {
          changes.push({
            id: item.id,
            status: sourceStatus as WorkItemStatus,
            position,
          });
        }
      });
  }

  return changes;
}

function byPosition(a: BoardWorkItem, b: BoardWorkItem): number {
  return a.position - b.position || a.id - b.id;
}
