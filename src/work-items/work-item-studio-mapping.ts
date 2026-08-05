import type { WorkItemPriority, WorkItemStatus } from './work-item.entity';

/**
 * Pure translation tables between Studio's retired task vocabulary and
 * `WorkItem`'s — no Nest/DB deps, same split as `work-items.board.ts`.
 *
 * `work_items` is the single task backbone post-merge; these maps exist
 * only so anything still speaking Studio's shape (the `/studio/tasks*`
 * proxy controller, the Studio dashboard reading `work_items` but
 * rendering Studio's original vocabulary) can translate at the edge.
 */

export type StudioTaskStatus =
  | 'backlog'
  | 'this_quarter'
  | 'in_progress'
  | 'blocked'
  | 'in_review'
  | 'done';

export type StudioTaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export const STUDIO_STATUS_TO_WORK_ITEM_STATUS: Record<StudioTaskStatus, WorkItemStatus> = {
  backlog: 'backlog',
  this_quarter: 'todo',
  in_progress: 'in_progress',
  blocked: 'blocked',
  in_review: 'review',
  done: 'done',
};

export const WORK_ITEM_STATUS_TO_STUDIO_STATUS: Record<WorkItemStatus, StudioTaskStatus> = {
  backlog: 'backlog',
  todo: 'this_quarter',
  in_progress: 'in_progress',
  review: 'in_review',
  blocked: 'blocked',
  done: 'done',
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
