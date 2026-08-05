import { test, expect, describe } from 'bun:test';
import { planMove } from './work-items.board';
import type { WorkItemStatus } from './work-item.entity';

/** Minimal board row — id, column, rank. */
function card(id: number, status: WorkItemStatus, position: number) {
  return { id, status, position };
}

/** The placements a move produces, in a stable order for comparison. */
function sorted(placements: ReturnType<typeof planMove>) {
  return [...placements].sort((a, b) => a.id - b.id);
}

describe('planMove', () => {
  test('within a column: re-densifies the whole column', () => {
    const column = [card(1, 'todo', 0), card(2, 'todo', 1), card(3, 'todo', 2)];
    // 3 jumps to the top → 3,1,2
    expect(sorted(planMove(column, 3, 'todo', 0))).toEqual([
      { id: 1, status: 'todo', position: 1 },
      { id: 2, status: 'todo', position: 2 },
      { id: 3, status: 'todo', position: 0 },
    ]);
  });

  test('within a column: a no-op move writes nothing', () => {
    const column = [card(1, 'todo', 0), card(2, 'todo', 1)];
    expect(planMove(column, 1, 'todo', 0)).toEqual([]);
  });

  test('across columns: inserts in the target and closes the gap in the source', () => {
    const all = [
      card(1, 'backlog', 0),
      card(2, 'backlog', 1),
      card(3, 'backlog', 2),
      card(4, 'todo', 0),
      card(5, 'todo', 1),
    ];
    // 2 leaves the middle of `backlog` for the top of `todo`.
    expect(sorted(planMove(all, 2, 'todo', 0))).toEqual([
      { id: 2, status: 'todo', position: 0 },
      { id: 3, status: 'backlog', position: 1 }, // source re-densified (was 2)
      { id: 4, status: 'todo', position: 1 },
      { id: 5, status: 'todo', position: 2 },
    ]);
  });

  test('across columns into an empty column', () => {
    const all = [card(1, 'backlog', 0), card(2, 'backlog', 1)];
    expect(sorted(planMove(all, 1, 'done', 0))).toEqual([
      { id: 1, status: 'done', position: 0 },
      { id: 2, status: 'backlog', position: 0 },
    ]);
  });

  test('boundary: a position past the end appends instead of failing', () => {
    const all = [card(1, 'todo', 0), card(2, 'todo', 1), card(9, 'backlog', 0)];
    expect(sorted(planMove(all, 9, 'todo', 99))).toEqual([
      { id: 9, status: 'todo', position: 2 },
    ]);
  });

  test('boundary: a negative position clamps to the top of the column', () => {
    const all = [card(1, 'todo', 0), card(2, 'todo', 1)];
    expect(sorted(planMove(all, 2, 'todo', -5))).toEqual([
      { id: 1, status: 'todo', position: 1 },
      { id: 2, status: 'todo', position: 0 },
    ]);
  });

  test('boundary: moving the last card to the very end changes nothing', () => {
    const all = [card(1, 'todo', 0), card(2, 'todo', 1)];
    expect(planMove(all, 2, 'todo', 1)).toEqual([]);
  });

  test('heals a column that already had gapped or duplicated ranks', () => {
    const all = [card(1, 'todo', 5), card(2, 'todo', 5), card(3, 'todo', 40)];
    expect(sorted(planMove(all, 3, 'todo', 0))).toEqual([
      { id: 1, status: 'todo', position: 1 },
      { id: 2, status: 'todo', position: 2 },
      { id: 3, status: 'todo', position: 0 },
    ]);
  });

  test('an unknown id is a no-op', () => {
    expect(planMove([card(1, 'backlog', 0)], 999, 'todo', 0)).toEqual([]);
  });
});
