import type { WorkItemPriority, WorkItemStatus } from './work-item.entity';

/**
 * Pure translation tables between Studio's task vocabulary and `WorkItem`'s
 * — no Nest/DB deps, same split as `work-items.board.ts`.
 *
 * `work_items` is the single task backbone post-merge; these maps exist
 * only so anything still speaking Studio's shape (the `/studio/tasks*`
 * proxy controller, the Studio dashboard reading `work_items`) can
 * translate at the edge. Status is now an identity map: Studio's board
 * columns (À faire · En cours · Bloqué · En revue · Résolu · Fermé) are the
 * same six values as `WorkItemStatus` — the old `backlog`/`this_quarter`
 * split and `in_review`/`done` naming were retired together.
 */

export type StudioTaskStatus = WorkItemStatus;

export type StudioTaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export const STUDIO_STATUS_TO_WORK_ITEM_STATUS: Record<StudioTaskStatus, WorkItemStatus> = {
  todo: 'todo',
  in_progress: 'in_progress',
  blocked: 'blocked',
  review: 'review',
  resolved: 'resolved',
  closed: 'closed',
};

export const WORK_ITEM_STATUS_TO_STUDIO_STATUS: Record<WorkItemStatus, StudioTaskStatus> = {
  todo: 'todo',
  in_progress: 'in_progress',
  blocked: 'blocked',
  review: 'review',
  resolved: 'resolved',
  closed: 'closed',
};

/** Studio's `none`/`low` both fold into WorkItem's lowest bucket, `P3`. */
export const STUDIO_PRIORITY_TO_WORK_ITEM_PRIORITY: Record<StudioTaskPriority, WorkItemPriority> = {
  none: 'P3',
  low: 'P3',
  medium: 'P2',
  high: 'P1',
  urgent: 'P0',
};

/** `P3` maps back to `low` — `none` has no WorkItem-side equivalent to round-trip to. */
export const WORK_ITEM_PRIORITY_TO_STUDIO_PRIORITY: Record<WorkItemPriority, StudioTaskPriority> = {
  P0: 'urgent',
  P1: 'high',
  P2: 'medium',
  P3: 'low',
};
