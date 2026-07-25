import type {
  RoadmapInitiativePriority,
  RoadmapInitiativeStatus,
} from './roadmap-initiative.entity';

/**
 * Pure board/timeline shaping for the roadmap — grouping, ordering and the
 * `move` reordering plan. No Nest/DB deps so it can be unit-tested in
 * isolation (`bun test`); `RoadmapService` only fetches and persists.
 */

/** Kanban columns, in display order. Same shape as the pipeline board. */
export const INITIATIVE_STATUSES: RoadmapInitiativeStatus[] = [
  'idea',
  'planned',
  'in_progress',
  'shipped',
  'dropped',
];

export const STATUS_LABELS: Record<RoadmapInitiativeStatus, string> = {
  idea: 'Idée',
  planned: 'Planifié',
  in_progress: 'En cours',
  shipped: 'Livré',
  dropped: 'Abandonné',
};

export const STATUS_TONES: Record<RoadmapInitiativeStatus, string> = {
  idea: '#94A3B8',
  planned: '#4F46E5',
  in_progress: '#D97706',
  shipped: '#16A34A',
  dropped: '#B91C1C',
};

/** Priorities, strongest first — drives the timeline tie-break. */
export const INITIATIVE_PRIORITIES: RoadmapInitiativePriority[] = [
  'P0',
  'P1',
  'P2',
  'P3',
];

/** Timeline bucket id for initiatives with no quarter. */
export const UNSCHEDULED_BUCKET = 'unscheduled';

/** Minimal shape the board needs (decoupled from the entity). */
export interface BoardInitiative {
  id: string;
  status: string;
  position: number;
}

/** Minimal shape the timeline needs (decoupled from the entity). */
export interface TimelineInitiative {
  id: string;
  quarter: string | null;
  targetDate: string | null;
  priority: string;
}

export interface RoadmapBoardColumn<T> {
  id: RoadmapInitiativeStatus;
  label: string;
  tone: string;
  items: T[];
}

export interface RoadmapTimelineBucket<T> {
  quarter: string;
  label: string;
  items: T[];
}

/** Position/status a `move` must persist for one initiative. */
export interface InitiativePlacement {
  id: string;
  status: RoadmapInitiativeStatus;
  position: number;
}

/**
 * Groups initiatives into the five kanban columns, each ordered by
 * `position` (ties broken by id so the output is stable). Every column is
 * always present, even empty — the UI renders a fixed board.
 */
export function buildBoard<T extends BoardInitiative>(
  items: T[],
): RoadmapBoardColumn<T>[] {
  return INITIATIVE_STATUSES.map((id) => ({
    id,
    label: STATUS_LABELS[id],
    tone: STATUS_TONES[id],
    items: items.filter((i) => i.status === id).sort(byPosition),
  }));
}

/**
 * Groups initiatives by quarter, oldest quarter first, with the
 * `unscheduled` bucket (no quarter) always last. Inside a bucket: nearest
 * `targetDate` first (undated last), then by priority (P0 → P3).
 *
 * Only non-empty buckets are returned — quarters are open-ended, there is no
 * fixed set to render.
 */
export function buildTimeline<T extends TimelineInitiative>(
  items: T[],
): RoadmapTimelineBucket<T>[] {
  const byQuarter = new Map<string, T[]>();
  for (const item of items) {
    const key = item.quarter ?? UNSCHEDULED_BUCKET;
    const bucket = byQuarter.get(key);
    if (bucket) bucket.push(item);
    else byQuarter.set(key, [item]);
  }
  return [...byQuarter.keys()]
    .sort(byQuarterKey)
    .map((quarter) => ({
      quarter,
      label: quarter === UNSCHEDULED_BUCKET ? 'Non planifié' : quarter,
      items: (byQuarter.get(quarter) ?? []).sort(byTargetDateThenPriority),
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
export function planMove<T extends BoardInitiative>(
  all: T[],
  movedId: string,
  targetStatus: RoadmapInitiativeStatus,
  targetPosition: number,
): InitiativePlacement[] {
  const moved = all.find((i) => i.id === movedId);
  if (!moved) return [];
  const sourceStatus = moved.status;

  const target = all
    .filter((i) => i.status === targetStatus && i.id !== movedId)
    .sort(byPosition);
  const index = Math.min(Math.max(Math.trunc(targetPosition), 0), target.length);
  target.splice(index, 0, moved);

  const changes: InitiativePlacement[] = [];
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
            status: sourceStatus as RoadmapInitiativeStatus,
            position,
          });
        }
      });
  }

  return changes;
}

// ── comparators ──────────────────────────────────────────────────

function byPosition(a: BoardInitiative, b: BoardInitiative): number {
  return a.position - b.position || a.id.localeCompare(b.id);
}

/** `YYYY-Qn` sorts lexicographically; `unscheduled` is forced last. */
function byQuarterKey(a: string, b: string): number {
  if (a === UNSCHEDULED_BUCKET) return 1;
  if (b === UNSCHEDULED_BUCKET) return -1;
  return a.localeCompare(b);
}

function byTargetDateThenPriority(
  a: TimelineInitiative,
  b: TimelineInitiative,
): number {
  if (a.targetDate !== b.targetDate) {
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return a.targetDate.localeCompare(b.targetDate);
  }
  const rank = priorityRank(a.priority) - priorityRank(b.priority);
  return rank || a.id.localeCompare(b.id);
}

/** Unknown priorities sort after every known one rather than crashing. */
function priorityRank(priority: string): number {
  const idx = INITIATIVE_PRIORITIES.indexOf(
    priority as RoadmapInitiativePriority,
  );
  return idx < 0 ? INITIATIVE_PRIORITIES.length : idx;
}
