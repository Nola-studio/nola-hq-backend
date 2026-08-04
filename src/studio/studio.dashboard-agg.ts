import { TASK_STATUSES } from './studio.board';
import type { StudioTaskStatus } from './studio-task.entity';

/**
 * Pure aggregation helpers for `StudioDashboardService`. No Nest/DB deps —
 * unit-tested in isolation (`bun test`), same approach as `studio.board.ts`.
 */

export interface DashboardTask {
  status: StudioTaskStatus;
  priority: string;
  assigneeEmail: string | null;
}

/** One entry per kanban column, in board order, zero-filled if empty. */
export function tasksByStatus(tasks: { status: StudioTaskStatus }[]): { status: string; count: number }[] {
  const counts = new Map<StudioTaskStatus, number>();
  for (const t of tasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1);
  return TASK_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

/** Open (not `done`) task count per assignee — the workload view. */
export function openTasksByAssignee(
  tasks: { status: StudioTaskStatus; assigneeEmail: string | null }[],
): { assigneeEmail: string | null; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const key = t.assigneeEmail ?? 'unassigned';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => ({
    assigneeEmail: key === 'unassigned' ? null : key,
    count,
  }));
}

export function countBlocked(tasks: { status: StudioTaskStatus }[]): number {
  return tasks.filter((t) => t.status === 'blocked').length;
}

/** Open tasks at `high` or `urgent` priority — `urgent` is a superset, not a separate tier. */
export function countHighOrUrgentPriorityOpen(
  tasks: { status: StudioTaskStatus; priority: string }[],
): number {
  return tasks.filter(
    (t) => t.status !== 'done' && (t.priority === 'high' || t.priority === 'urgent'),
  ).length;
}

export function donePercent(tasks: { status: StudioTaskStatus }[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === 'done').length;
  return Math.round((done / tasks.length) * 100);
}
