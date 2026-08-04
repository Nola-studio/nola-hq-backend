import { test, expect, describe } from 'bun:test';
import { TASK_STATUSES, STATUS_LABELS, buildBoard, planMove } from './studio.board';
import type { StudioTaskStatus } from './studio-task.entity';

/** Minimal board row — id, column, rank. */
function card(id: string, status: StudioTaskStatus, position: number) {
  return { id, status, position };
}

/** The placements a move produces, in a stable order for comparison. */
function sorted(placements: ReturnType<typeof planMove>) {
  return [...placements].sort((a, b) => a.id.localeCompare(b.id));
}

describe('buildBoard', () => {
  test('always returns the six columns, in display order, with a label', () => {
    const columns = buildBoard([]);
    expect(columns.map((c) => c.id)).toEqual(TASK_STATUSES);
    expect(columns.map((c) => c.label)).toEqual(TASK_STATUSES.map((s) => STATUS_LABELS[s]));
    expect(columns.every((c) => c.items.length === 0)).toBe(true);
  });

  test('groups tasks by status, each column ordered by position', () => {
    const columns = buildBoard([
      card('a', 'backlog', 1),
      card('b', 'in_progress', 0),
      card('c', 'backlog', 0),
      card('d', 'done', 0),
      card('e', 'blocked', 0),
    ]);
    const byId = Object.fromEntries(columns.map((c) => [c.id, c.items.map((i) => i.id)]));
    expect(byId.backlog).toEqual(['c', 'a']);
    expect(byId.this_quarter).toEqual([]);
    expect(byId.in_progress).toEqual(['b']);
    expect(byId.blocked).toEqual(['e']);
    expect(byId.in_review).toEqual([]);
    expect(byId.done).toEqual(['d']);
  });

  test('ties on position are broken by id', () => {
    const columns = buildBoard([card('b', 'backlog', 0), card('a', 'backlog', 0)]);
    expect(columns[0].items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('planMove', () => {
  test('reorders within a column and re-densifies it', () => {
    const rows = [card('a', 'backlog', 0), card('b', 'backlog', 1), card('c', 'backlog', 2)];
    const placements = planMove(rows, 'c', 'backlog', 0);
    expect(sorted(placements)).toEqual([
      { id: 'a', status: 'backlog', position: 1 },
      { id: 'b', status: 'backlog', position: 2 },
      { id: 'c', status: 'backlog', position: 0 },
    ]);
  });

  test('moves across columns and closes the gap in the source column', () => {
    const rows = [
      card('a', 'backlog', 0),
      card('b', 'backlog', 1),
      card('c', 'done', 0),
    ];
    const placements = planMove(rows, 'a', 'done', 1);
    expect(sorted(placements)).toEqual([
      { id: 'a', status: 'done', position: 1 },
      { id: 'b', status: 'backlog', position: 0 },
    ]);
  });

  test('clamps an out-of-range position to the end of the column', () => {
    const rows = [card('a', 'backlog', 0), card('b', 'backlog', 1)];
    const placements = planMove(rows, 'a', 'backlog', 99);
    expect(sorted(placements)).toEqual([
      { id: 'a', status: 'backlog', position: 1 },
      { id: 'b', status: 'backlog', position: 0 },
    ]);
  });

  test('returns nothing when the move is a no-op', () => {
    const rows = [card('a', 'backlog', 0), card('b', 'backlog', 1)];
    expect(planMove(rows, 'a', 'backlog', 0)).toEqual([]);
  });

  test('returns nothing for an unknown task id', () => {
    expect(planMove([card('a', 'backlog', 0)], 'missing', 'done', 0)).toEqual([]);
  });
});
