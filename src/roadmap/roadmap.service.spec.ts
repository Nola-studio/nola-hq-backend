import { test, expect, describe, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { RoadmapService } from './roadmap.service';
import type { RoadmapInitiativeStatus } from './roadmap-initiative.entity';

/**
 * `move` wiring: the reordering plan is computed by `planMove` (unit-tested
 * in roadmap.board.spec.ts) — here we check the service persists exactly the
 * touched rows and nothing else. The three repositories are mocked the way
 * team.service.spec.ts does: no DB, no Nest container.
 */

interface Row {
  id: string;
  status: RoadmapInitiativeStatus;
  position: number;
  progress: number;
  updatedAt?: Date;
}

function row(
  id: string,
  status: RoadmapInitiativeStatus,
  position: number,
): Row {
  return { id, status, position, progress: 0 };
}

/**
 * In-memory initiatives repository. `find` hands back copies so we can assert
 * on what reached `save` rather than on mutated fixtures.
 */
function makeInitiativesRepo(rows: Row[]) {
  return {
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    find: mock(async () => rows.map((r) => ({ ...r }))),
    save: mock(async (x: unknown) => x),
    count: mock(async () => rows.length),
  } as any;
}

const noMilestones = { find: mock(async () => []) } as any;
const objectives = { findOne: mock(async () => null) } as any;

/** The `{id,status,position}` triples handed to `save`, id-sorted. */
function persisted(repo: any) {
  const [items] = repo.save.mock.calls[0] as [Row[]];
  return items
    .map((i) => ({ id: i.id, status: i.status, position: i.position }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('RoadmapService.move', () => {
  test('reorders within a column and saves every shifted card once', async () => {
    const rows = [
      row('a', 'planned', 0),
      row('b', 'planned', 1),
      row('c', 'planned', 2),
    ];
    const repo = makeInitiativesRepo(rows);
    const svc = new RoadmapService(objectives, repo, noMilestones);

    await svc.move('c', { status: 'planned', position: 0 });

    expect(repo.save).toHaveBeenCalledTimes(1); // one write → one transaction
    expect(persisted(repo)).toEqual([
      { id: 'a', status: 'planned', position: 1 },
      { id: 'b', status: 'planned', position: 2 },
      { id: 'c', status: 'planned', position: 0 },
    ]);
  });

  test('moves across columns and closes the gap left in the source', async () => {
    const rows = [
      row('a', 'idea', 0),
      row('b', 'idea', 1),
      row('c', 'idea', 2),
      row('x', 'planned', 0),
    ];
    const repo = makeInitiativesRepo(rows);
    const svc = new RoadmapService(objectives, repo, noMilestones);

    await svc.move('b', { status: 'planned', position: 0 });

    expect(persisted(repo)).toEqual([
      { id: 'b', status: 'planned', position: 0 },
      { id: 'c', status: 'idea', position: 1 },
      { id: 'x', status: 'planned', position: 1 },
    ]);
  });

  test('an out-of-range position appends to the target column', async () => {
    const rows = [
      row('a', 'shipped', 0),
      row('b', 'shipped', 1),
      row('x', 'idea', 0),
    ];
    const repo = makeInitiativesRepo(rows);
    const svc = new RoadmapService(objectives, repo, noMilestones);

    await svc.move('x', { status: 'shipped', position: 99 });

    expect(persisted(repo)).toEqual([
      { id: 'x', status: 'shipped', position: 2 },
    ]);
  });

  test('defaults to the top of the column when no position is given', async () => {
    const rows = [row('a', 'planned', 0), row('x', 'idea', 0)];
    const repo = makeInitiativesRepo(rows);
    const svc = new RoadmapService(objectives, repo, noMilestones);

    await svc.move('x', { status: 'planned' });

    expect(persisted(repo)).toEqual([
      { id: 'a', status: 'planned', position: 1 },
      { id: 'x', status: 'planned', position: 0 },
    ]);
  });

  test('a no-op move writes nothing at all', async () => {
    const rows = [row('a', 'planned', 0), row('b', 'planned', 1)];
    const repo = makeInitiativesRepo(rows);
    const svc = new RoadmapService(objectives, repo, noMilestones);

    const moved = await svc.move('a', { status: 'planned', position: 0 });

    expect(repo.save).not.toHaveBeenCalled();
    expect(moved.id).toBe('a');
    expect(moved.progress).toBe(0);
    expect(moved.milestoneCount).toBe(0);
  });

  test('unknown initiative → 404, nothing persisted', async () => {
    const repo = makeInitiativesRepo([row('a', 'planned', 0)]);
    const svc = new RoadmapService(objectives, repo, noMilestones);

    await expect(svc.move('ghost', { status: 'planned', position: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('RoadmapService read model', () => {
  test('a listed initiative carries the progress derived from its milestones', async () => {
    const rows = [row('a', 'in_progress', 0)];
    rows[0].progress = 5; // stored fallback, must be overridden by the checklist
    const repo = makeInitiativesRepo(rows);
    const milestones = {
      find: mock(async () => [
        { initiativeId: 'a', done: true },
        { initiativeId: 'a', done: true },
        { initiativeId: 'a', done: false },
      ]),
    } as any;
    const svc = new RoadmapService(objectives, repo, milestones);

    const [view] = await svc.listInitiatives();
    expect(view.progress).toBe(67); // 2/3 → 66.67 → 67
    expect(view.milestoneCount).toBe(3);
    expect(view.milestonesDone).toBe(2);
  });

  test('the board columns carry the same derived progress', async () => {
    const rows = [row('a', 'in_progress', 0)];
    rows[0].progress = 5;
    const repo = makeInitiativesRepo(rows);
    const milestones = {
      find: mock(async () => [{ initiativeId: 'a', done: true }]),
    } as any;
    const svc = new RoadmapService(objectives, repo, milestones);

    const columns = await svc.board();
    const inProgress = columns.find((c) => c.id === 'in_progress')!;
    expect(inProgress.items.map((i) => i.progress)).toEqual([100]);
  });
});
