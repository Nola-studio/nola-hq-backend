import type { StudioTaskStatus } from './studio-task.entity';

/**
 * Pure board shaping for the Studio kanban — grouping, ordering and the
 * `move` reordering plan. No Nest/DB deps so it can be unit-tested in
 * isolation (`bun test`); `StudioTasksService` only fetches and persists.
 *
 * Identical algorithm to `roadmap.board.ts`'s `buildBoard`/`planMove`,
 * retyped for `StudioTaskStatus`.
 */

export const TASK_STATUSES: StudioTaskStatus[] = [
  'backlog',
  'this_quarter',
  'in_progress',
  'blocked',
  'in_review',
  'done',
];

export const STATUS_LABELS: Record<StudioTaskStatus, string> = {
  backlog: 'Backlog',
  this_quarter: 'Ce trimestre',
  in_progress: 'En cours',
  blocked: 'Bloqué',
  in_review: 'En review',
  done: 'Fait',
};

/** Minimal shape the board needs (decoupled from the entity). */
export interface BoardTask {
  id: string;
  status: string;
  position: number;
}

export interface StudioBoardColumn<T> {
  id: StudioTaskStatus;
  label: string;
  items: T[];
}

/** Position/status a `move` must persist for one task. */
export interface TaskPlacement {
  id: string;
  status: StudioTaskStatus;
  position: number;
}

/**
 * Groups tasks into the six kanban columns, each ordered by `position`
 * (ties broken by id so the output is stable). Every column is always
 * present, even empty — the UI renders a fixed board.
 */
export function buildBoard<T extends BoardTask>(items: T[]): StudioBoardColumn<T>[] {
  return TASK_STATUSES.map((id) => ({
    id,
    label: STATUS_LABELS[id],
    items: items.filter((i) => i.status === id).sort(byPosition),
  }));
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
export function planMove<T extends BoardTask>(
  all: T[],
  movedId: string,
  targetStatus: StudioTaskStatus,
  targetPosition: number,
): TaskPlacement[] {
  const moved = all.find((i) => i.id === movedId);
  if (!moved) return [];
  const sourceStatus = moved.status;

  const target = all
    .filter((i) => i.status === targetStatus && i.id !== movedId)
    .sort(byPosition);
  const index = Math.min(Math.max(Math.trunc(targetPosition), 0), target.length);
  target.splice(index, 0, moved);

  const changes: TaskPlacement[] = [];
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
          changes.push({ id: item.id, status: sourceStatus as StudioTaskStatus, position });
        }
      });
  }

  return changes;
}

function byPosition(a: BoardTask, b: BoardTask): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}
