import { test, expect, describe } from 'bun:test';
import {
  INITIATIVE_STATUSES,
  STATUS_LABELS,
  UNSCHEDULED_BUCKET,
  buildBoard,
  buildTimeline,
  planMove,
} from './roadmap.board';
import type { RoadmapInitiativeStatus } from './roadmap-initiative.entity';

/** Minimal board row — id, column, rank. */
function card(
  id: string,
  status: RoadmapInitiativeStatus,
  position: number,
) {
  return { id, status, position };
}

/** Minimal timeline row. */
function slot(
  id: string,
  quarter: string | null,
  targetDate: string | null,
  priority = 'P2',
) {
  return { id, quarter, targetDate, priority };
}

/** The placements a move produces, in a stable order for comparison. */
function sorted(placements: ReturnType<typeof planMove>) {
  return [...placements].sort((a, b) => a.id.localeCompare(b.id));
}

describe('buildBoard', () => {
  test('always returns the five columns, in display order, with label + tone', () => {
    const columns = buildBoard([]);
    expect(columns.map((c) => c.id)).toEqual(INITIATIVE_STATUSES);
    expect(columns.map((c) => c.label)).toEqual(
      INITIATIVE_STATUSES.map((s) => STATUS_LABELS[s]),
    );
    expect(columns.every((c) => /^#[0-9A-F]{6}$/.test(c.tone))).toBe(true);
    expect(columns.every((c) => c.items.length === 0)).toBe(true);
  });

  test('groups initiatives by status', () => {
    const columns = buildBoard([
      card('a', 'idea', 0),
      card('b', 'in_progress', 0),
      card('c', 'idea', 1),
      card('d', 'dropped', 0),
    ]);
    const byId = Object.fromEntries(columns.map((c) => [c.id, c.items.map((i) => i.id)]));
    expect(byId.idea).toEqual(['a', 'c']);
    expect(byId.planned).toEqual([]);
    expect(byId.in_progress).toEqual(['b']);
    expect(byId.shipped).toEqual([]);
    expect(byId.dropped).toEqual(['d']);
  });

  test('orders each column by position, whatever the input order', () => {
    const columns = buildBoard([
      card('c', 'planned', 2),
      card('a', 'planned', 0),
      card('b', 'planned', 1),
    ]);
    const planned = columns.find((c) => c.id === 'planned')!;
    expect(planned.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  test('ties on position fall back to the id, so the board is stable', () => {
    const columns = buildBoard([
      card('z', 'shipped', 0),
      card('a', 'shipped', 0),
    ]);
    expect(columns.find((c) => c.id === 'shipped')!.items.map((i) => i.id)).toEqual([
      'a',
      'z',
    ]);
  });
});

describe('buildTimeline', () => {
  test('buckets by quarter, oldest first, unscheduled last', () => {
    const buckets = buildTimeline([
      slot('a', '2026-Q4', null),
      slot('b', null, null),
      slot('c', '2026-Q1', null),
      slot('d', '2026-Q4', null),
    ]);
    expect(buckets.map((b) => b.quarter)).toEqual([
      '2026-Q1',
      '2026-Q4',
      UNSCHEDULED_BUCKET,
    ]);
    expect(buckets[1].items.map((i) => i.id)).toEqual(['a', 'd']);
    expect(buckets[2].label).toBe('Non planifié');
    expect(buckets[0].label).toBe('2026-Q1');
  });

  test('orders a bucket by target date, undated last', () => {
    const [bucket] = buildTimeline([
      slot('late', '2026-Q3', '2026-09-30'),
      slot('none', '2026-Q3', null),
      slot('early', '2026-Q3', '2026-07-01'),
    ]);
    expect(bucket.items.map((i) => i.id)).toEqual(['early', 'late', 'none']);
  });

  test('breaks a date tie by priority (P0 → P3)', () => {
    const [bucket] = buildTimeline([
      slot('p2', '2026-Q3', '2026-08-01', 'P2'),
      slot('p0', '2026-Q3', '2026-08-01', 'P0'),
      slot('p1', '2026-Q3', '2026-08-01', 'P1'),
    ]);
    expect(bucket.items.map((i) => i.id)).toEqual(['p0', 'p1', 'p2']);
  });

  test('returns nothing when there is nothing to schedule', () => {
    expect(buildTimeline([])).toEqual([]);
  });
});

describe('planMove', () => {
  test('within a column: re-densifies the whole column', () => {
    const column = [
      card('a', 'planned', 0),
      card('b', 'planned', 1),
      card('c', 'planned', 2),
    ];
    // c jumps to the top → c,a,b
    expect(sorted(planMove(column, 'c', 'planned', 0))).toEqual([
      { id: 'a', status: 'planned', position: 1 },
      { id: 'b', status: 'planned', position: 2 },
      { id: 'c', status: 'planned', position: 0 },
    ]);
  });

  test('within a column: a no-op move writes nothing', () => {
    const column = [card('a', 'planned', 0), card('b', 'planned', 1)];
    expect(planMove(column, 'a', 'planned', 0)).toEqual([]);
  });

  test('across columns: inserts in the target and closes the gap in the source', () => {
    const all = [
      card('a', 'idea', 0),
      card('b', 'idea', 1),
      card('c', 'idea', 2),
      card('x', 'planned', 0),
      card('y', 'planned', 1),
    ];
    // b leaves the middle of `idea` for the top of `planned`.
    expect(sorted(planMove(all, 'b', 'planned', 0))).toEqual([
      { id: 'b', status: 'planned', position: 0 },
      { id: 'c', status: 'idea', position: 1 }, // source re-densified (was 2)
      { id: 'x', status: 'planned', position: 1 },
      { id: 'y', status: 'planned', position: 2 },
    ]);
  });

  test('across columns into an empty column', () => {
    const all = [card('a', 'idea', 0), card('b', 'idea', 1)];
    expect(sorted(planMove(all, 'a', 'shipped', 0))).toEqual([
      { id: 'a', status: 'shipped', position: 0 },
      { id: 'b', status: 'idea', position: 0 },
    ]);
  });

  test('boundary: a position past the end appends instead of failing', () => {
    const all = [
      card('a', 'planned', 0),
      card('b', 'planned', 1),
      card('x', 'idea', 0),
    ];
    expect(sorted(planMove(all, 'x', 'planned', 99))).toEqual([
      { id: 'x', status: 'planned', position: 2 },
    ]);
  });

  test('boundary: a negative position clamps to the top of the column', () => {
    const all = [card('a', 'planned', 0), card('b', 'planned', 1)];
    expect(sorted(planMove(all, 'b', 'planned', -5))).toEqual([
      { id: 'a', status: 'planned', position: 1 },
      { id: 'b', status: 'planned', position: 0 },
    ]);
  });

  test('boundary: moving the last card to the very end changes nothing', () => {
    const all = [card('a', 'planned', 0), card('b', 'planned', 1)];
    expect(planMove(all, 'b', 'planned', 1)).toEqual([]);
  });

  test('heals a column that already had gapped or duplicated ranks', () => {
    const all = [
      card('a', 'planned', 5),
      card('b', 'planned', 5),
      card('c', 'planned', 40),
    ];
    expect(sorted(planMove(all, 'c', 'planned', 0))).toEqual([
      { id: 'a', status: 'planned', position: 1 },
      { id: 'b', status: 'planned', position: 2 },
      { id: 'c', status: 'planned', position: 0 },
    ]);
  });

  test('an unknown id is a no-op', () => {
    expect(planMove([card('a', 'idea', 0)], 'ghost', 'planned', 0)).toEqual([]);
  });
});
