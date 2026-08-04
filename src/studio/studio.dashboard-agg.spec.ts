import { test, expect, describe } from 'bun:test';
import {
  tasksByStatus,
  openTasksByAssignee,
  countBlocked,
  countHighPriorityOpen,
  donePercent,
} from './studio.dashboard-agg';
import type { StudioTaskStatus } from './studio-task.entity';

function task(status: StudioTaskStatus, priority = 'none', assigneeEmail: string | null = null) {
  return { status, priority, assigneeEmail };
}

describe('tasksByStatus', () => {
  test('zero-fills every column, in board order', () => {
    expect(tasksByStatus([])).toEqual([
      { status: 'backlog', count: 0 },
      { status: 'this_quarter', count: 0 },
      { status: 'in_progress', count: 0 },
      { status: 'blocked', count: 0 },
      { status: 'in_review', count: 0 },
      { status: 'done', count: 0 },
    ]);
  });

  test('counts tasks per status', () => {
    const result = tasksByStatus([task('backlog'), task('backlog'), task('blocked'), task('done')]);
    expect(result).toEqual([
      { status: 'backlog', count: 2 },
      { status: 'this_quarter', count: 0 },
      { status: 'in_progress', count: 0 },
      { status: 'blocked', count: 1 },
      { status: 'in_review', count: 0 },
      { status: 'done', count: 1 },
    ]);
  });
});

describe('openTasksByAssignee', () => {
  test('excludes done tasks and groups unassigned as null', () => {
    const result = openTasksByAssignee([
      task('in_progress', 'none', 'a@nola.dev'),
      task('backlog', 'none', 'a@nola.dev'),
      task('done', 'none', 'a@nola.dev'),
      task('blocked', 'none', null),
    ]);
    expect(result).toEqual(
      expect.arrayContaining([
        { assigneeEmail: 'a@nola.dev', count: 2 },
        { assigneeEmail: null, count: 1 },
      ]),
    );
  });

  test('empty input yields no entries', () => {
    expect(openTasksByAssignee([])).toEqual([]);
  });
});

describe('countBlocked', () => {
  test('counts only blocked-status tasks', () => {
    expect(countBlocked([task('blocked'), task('backlog'), task('blocked')])).toBe(2);
  });
});

describe('countHighPriorityOpen', () => {
  test('counts open tasks with priority=high, excludes done and other priorities', () => {
    const result = countHighPriorityOpen([
      task('backlog', 'high'),
      task('done', 'high'),
      task('in_progress', 'urgent'),
      task('in_progress', 'high'),
    ]);
    expect(result).toBe(2);
  });
});

describe('donePercent', () => {
  test('rounds to the nearest percent', () => {
    expect(donePercent([task('done'), task('done'), task('backlog')])).toBe(67);
  });

  test('returns 0 for an empty task list', () => {
    expect(donePercent([])).toBe(0);
  });
});
