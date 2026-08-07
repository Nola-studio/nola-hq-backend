import { test, expect, describe, mock } from 'bun:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

/** Key results / trajectory points / snapshots are out of scope here. */
const empty = () => ({ find: mock(async () => []), count: mock(async () => 0) }) as any;

/** The service under test, with only the repositories these cases touch. */
function makeService(initiatives: any, milestones: any = noMilestones, workItems: any = empty()) {
  return new RoadmapService(
    objectives,
    initiatives,
    milestones,
    empty(),
    empty(),
    empty(),
    workItems,
  );
}

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
    const svc = makeService(repo);

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
    const svc = makeService(repo);

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
    const svc = makeService(repo);

    await svc.move('x', { status: 'shipped', position: 99 });

    expect(persisted(repo)).toEqual([
      { id: 'x', status: 'shipped', position: 2 },
    ]);
  });

  test('defaults to the top of the column when no position is given', async () => {
    const rows = [row('a', 'planned', 0), row('x', 'idea', 0)];
    const repo = makeInitiativesRepo(rows);
    const svc = makeService(repo);

    await svc.move('x', { status: 'planned' });

    expect(persisted(repo)).toEqual([
      { id: 'a', status: 'planned', position: 1 },
      { id: 'x', status: 'planned', position: 0 },
    ]);
  });

  test('a no-op move writes nothing at all', async () => {
    const rows = [row('a', 'planned', 0), row('b', 'planned', 1)];
    const repo = makeInitiativesRepo(rows);
    const svc = makeService(repo);

    const moved = await svc.move('a', { status: 'planned', position: 0 });

    expect(repo.save).not.toHaveBeenCalled();
    expect(moved.id).toBe('a');
    expect(moved.progress).toBe(0);
    expect(moved.milestoneCount).toBe(0);
  });

  test('unknown initiative → 404, nothing persisted', async () => {
    const repo = makeInitiativesRepo([row('a', 'planned', 0)]);
    const svc = makeService(repo);

    await expect(svc.move('ghost', { status: 'planned', position: 0 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});

/**
 * `updateKeyPrefix`'s repo needs `findOne` keyed on either `id` or
 * `keyPrefix` (the two lookups the method does), and a `count` on the
 * work-items repo that understands a `Like('T<prefix>%')` filter.
 */
function makeKeyPrefixRepos(initiativeRows: Array<{ id: string; keyPrefix: string | null }>, taskReferences: string[]) {
  const initiatives = {
    findOne: mock(async ({ where }: any) => {
      if (where.id) return initiativeRows.find((r) => r.id === where.id) ?? null;
      if (where.keyPrefix) return initiativeRows.find((r) => r.keyPrefix === where.keyPrefix) ?? null;
      return null;
    }),
    save: mock(async (x: unknown) => x),
  } as any;
  const workItems = {
    count: mock(async ({ where }: any) => {
      const pattern: string = where.reference.value; // e.g. "TYek%"
      const prefix = pattern.slice(0, -1); // strip the trailing "%"
      return taskReferences.filter((r) => r.startsWith(prefix)).length;
    }),
  } as any;
  return { initiatives, workItems };
}

describe('RoadmapService.updateKeyPrefix', () => {
  test('renames a prefix nothing references yet', async () => {
    const { initiatives, workItems } = makeKeyPrefixRepos(
      [{ id: 'a', keyPrefix: 'ajoutercon' }],
      [],
    );
    const svc = makeService(initiatives, noMilestones, workItems);

    const view = await svc.updateKeyPrefix('a', { keyPrefix: 'Offline' });
    expect(view.keyPrefix).toBe('Offline');
    expect(initiatives.save).toHaveBeenCalledTimes(1);
  });

  test('blocks the rename once a task already references the current prefix', async () => {
    const { initiatives, workItems } = makeKeyPrefixRepos(
      [{ id: 'a', keyPrefix: 'ajoutercon' }],
      ['Tajoutercon01'],
    );
    const svc = makeService(initiatives, noMilestones, workItems);

    await expect(svc.updateKeyPrefix('a', { keyPrefix: 'Offline' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(initiatives.save).not.toHaveBeenCalled();
  });

  test('rejects a prefix already used by another initiative', async () => {
    const { initiatives, workItems } = makeKeyPrefixRepos(
      [
        { id: 'a', keyPrefix: 'ajoutercon' },
        { id: 'b', keyPrefix: 'Taken' },
      ],
      [],
    );
    const svc = makeService(initiatives, noMilestones, workItems);

    await expect(svc.updateKeyPrefix('a', { keyPrefix: 'Taken' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(initiatives.save).not.toHaveBeenCalled();
  });

  test('a no-op rename (same prefix) is a silent success, not a conflict with itself', async () => {
    const { initiatives, workItems } = makeKeyPrefixRepos(
      [{ id: 'a', keyPrefix: 'ajoutercon' }],
      ['Tajoutercon01'], // even with tasks already referencing it
    );
    const svc = makeService(initiatives, noMilestones, workItems);

    const view = await svc.updateKeyPrefix('a', { keyPrefix: 'ajoutercon' });
    expect(view.keyPrefix).toBe('ajoutercon');
    expect(initiatives.save).not.toHaveBeenCalled();
  });

  test('unknown initiative → 404', async () => {
    const { initiatives, workItems } = makeKeyPrefixRepos([], []);
    const svc = makeService(initiatives, noMilestones, workItems);

    await expect(svc.updateKeyPrefix('ghost', { keyPrefix: 'Anything' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/**
 * `scope` firewalls the roadmap surface from durable products: a row with
 * `scope: 'project'` must behave as if it doesn't exist to every method
 * here except `updateScope` itself. This mock's `findOne`/`find` — unlike
 * `makeInitiativesRepo` above — actually honour `where.scope`, since that's
 * exactly the behavior under test.
 */
function makeScopedInitiativesRepo(rows: Array<Row & { scope: 'project' | 'initiative' }>) {
  return {
    findOne: mock(async ({ where }: any) => {
      const match = rows.find((r) => r.id === where.id);
      if (!match) return null;
      if (where.scope && match.scope !== where.scope) return null;
      return match;
    }),
    find: mock(async ({ where }: any = {}) =>
      rows.filter((r) => !where?.scope || r.scope === where.scope).map((r) => ({ ...r })),
    ),
    save: mock(async (x: unknown) => x),
    count: mock(async ({ where }: any = {}) => rows.filter((r) => !where?.scope || r.scope === where.scope).length),
  } as any;
}

describe('RoadmapService scope', () => {
  test('board(undefined) returns every row — scope is opt-in, other screens\' pickers need durable products too', async () => {
    const repo = makeScopedInitiativesRepo([
      { ...row('a', 'planned', 0), scope: 'initiative' },
      { ...row('b', 'planned', 1), scope: 'project' },
    ]);
    const svc = makeService(repo);

    const columns = await svc.board();
    const planned = columns.find((c) => c.id === 'planned')!;
    expect(planned.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  test("board('initiative') excludes durable products — Roadmap's own board opts in", async () => {
    const repo = makeScopedInitiativesRepo([
      { ...row('a', 'planned', 0), scope: 'initiative' },
      { ...row('b', 'planned', 1), scope: 'project' },
    ]);
    const svc = makeService(repo);

    const columns = await svc.board('initiative');
    const planned = columns.find((c) => c.id === 'planned')!;
    expect(planned.items.map((i) => i.id)).toEqual(['a']);
  });

  test("findInitiative() 404s on a durable product's id — it's /projects' row, not /roadmap's", async () => {
    const repo = makeScopedInitiativesRepo([{ ...row('a', 'planned', 0), scope: 'project' }]);
    const svc = makeService(repo);

    await expect(svc.findInitiative('a')).rejects.toBeInstanceOf(NotFoundException);
  });

  test('updateScope reclassifies regardless of current scope, and is a no-op when already correct', async () => {
    const repo = makeScopedInitiativesRepo([{ ...row('a', 'planned', 0), scope: 'project' }]);
    const svc = makeService(repo);

    const reclassified = await svc.updateScope('a', { scope: 'initiative' });
    expect(reclassified.scope).toBe('initiative');
    expect(repo.save).toHaveBeenCalledTimes(1);

    // The in-memory row was mutated in place by the first call — a second,
    // identical request must be a silent no-op, not a second write.
    await svc.updateScope('a', { scope: 'initiative' });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  test('unknown initiative → 404', async () => {
    const repo = makeScopedInitiativesRepo([]);
    const svc = makeService(repo);

    await expect(svc.updateScope('ghost', { scope: 'project' })).rejects.toBeInstanceOf(NotFoundException);
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
    const svc = makeService(repo, milestones);

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
    const svc = makeService(repo, milestones);

    const columns = await svc.board();
    const inProgress = columns.find((c) => c.id === 'in_progress')!;
    expect(inProgress.items.map((i) => i.progress)).toEqual([100]);
  });
});

/**
 * The objective read model: the service must batch-load key results,
 * initiatives and children, then hand the whole thing to the pure cascade
 * (`deriveCascadedObjectiveProgress`, unit-tested in
 * roadmap.trajectory.spec.ts). Repositories are mocked — no DB, no Nest.
 */

interface ObjectiveRow {
  id: string;
  parentId: string | null;
  progress: number;
  quarter?: string | null;
  year?: string | null;
}

function objectiveRow(
  id: string,
  over: Partial<ObjectiveRow> = {},
): ObjectiveRow {
  return { id, parentId: null, progress: 0, quarter: null, year: null, ...over };
}

/** A metric-free key result — its actuals come from its trajectory points. */
function keyResultRow(id: string, objectiveId: string, baseline: number, target: number) {
  return { id, objectiveId, metricKey: null, baseline, target, position: 0 };
}

/**
 * Wires a service over in-memory rows. `objectives.find` answers the two
 * distinct queries the read model issues (the listed rows, then their
 * children by `parentId`).
 */
function makeReadService(
  objectiveRows: ObjectiveRow[],
  keyResultRows: any[] = [],
  pointRows: any[] = [],
) {
  const objectivesRepo = {
    find: mock(async (opts: any) => {
      const parentIn = opts?.where?.parentId;
      if (parentIn) {
        const ids: string[] = parentIn._value ?? [];
        return objectiveRows.filter((o) => o.parentId && ids.includes(o.parentId));
      }
      return objectiveRows.filter((o) => !o.parentId);
    }),
    findOne: mock(async ({ where }: any) =>
      objectiveRows.find((o) => o.id === where.id) ?? null,
    ),
    count: mock(async ({ where }: any) =>
      objectiveRows.filter((o) => o.parentId === where.parentId).length,
    ),
    save: mock(async (x: unknown) => x),
    create: mock((x: unknown) => x),
    remove: mock(async (x: unknown) => x),
  } as any;
  const keyResultsRepo = {
    find: mock(async ({ where }: any) => {
      const ids: string[] = where.objectiveId?._value ?? [where.objectiveId];
      return keyResultRows.filter((k) => ids.includes(k.objectiveId));
    }),
  } as any;
  const pointsRepo = { find: mock(async () => pointRows) } as any;
  const snapshotsRepo = { find: mock(async () => []) } as any;
  const svc = new RoadmapService(
    objectivesRepo,
    { find: mock(async () => []), count: mock(async () => 0) } as any,
    { find: mock(async () => []) } as any,
    keyResultsRepo,
    pointsRepo,
    snapshotsRepo,
    empty(),
  );
  return { svc, objectivesRepo };
}

describe('RoadmapService objective cascade', () => {
  test('an objective with key results reports their mean progress', async () => {
    const { svc } = makeReadService(
      [objectiveRow('o1', { progress: 90 })], // stored value must be ignored
      [keyResultRow('k1', 'o1', 0, 100), keyResultRow('k2', 'o1', 0, 100)],
      [
        { keyResultId: 'k1', date: '2026-01-01', targetValue: 100, actualValue: 20 },
        { keyResultId: 'k2', date: '2026-01-01', targetValue: 100, actualValue: 80 },
      ],
    );

    const [view] = await svc.listObjectives();
    expect(view.progress).toBe(50);
    expect(view.keyResultCount).toBe(2);
    expect(view.initiativeCount).toBe(0);
  });

  test('an annual objective averages its quarterly children', async () => {
    const { svc } = makeReadService(
      [
        objectiveRow('annual', { year: '2026' }),
        objectiveRow('q1', { parentId: 'annual', quarter: '2026-Q1' }),
        objectiveRow('q2', { parentId: 'annual', quarter: '2026-Q2' }),
      ],
      [keyResultRow('k1', 'q1', 0, 100), keyResultRow('k2', 'q2', 0, 100)],
      [
        { keyResultId: 'k1', date: '2026-01-01', targetValue: 100, actualValue: 100 },
        { keyResultId: 'k2', date: '2026-01-01', targetValue: 100, actualValue: 40 },
      ],
    );

    const [annual] = await svc.listObjectives();
    expect(annual.id).toBe('annual');
    expect(annual.progress).toBe(70); // (100 + 40) / 2
  });

  test('the detail route hydrates key results, children and their measures', async () => {
    const { svc } = makeReadService(
      [
        objectiveRow('annual', { year: '2026' }),
        objectiveRow('q1', { parentId: 'annual', quarter: '2026-Q1' }),
      ],
      [keyResultRow('k1', 'q1', 8, 4)], // a "down" key result
      [{ keyResultId: 'k1', date: '2026-01-01', targetValue: 4, actualValue: 6 }],
    );

    const annual = await svc.findObjective('annual');
    expect(annual.children?.map((c) => c.id)).toEqual(['q1']);
    expect(annual.children?.[0].progress).toBe(50); // 8 → 4, currently 6
    expect(annual.keyResults).toEqual([]);

    const quarterly = await svc.findObjective('q1');
    expect(quarterly.keyResults?.[0]).toMatchObject({
      id: 'k1',
      current: 6,
      progress: 50,
      status: 'behind', // plan said 4 on 2026-01-01, we are at 6
    });
  });
});

describe('RoadmapService objective staging guards', () => {
  test('an objective plans a year OR a quarter, never both', async () => {
    const { svc } = makeReadService([objectiveRow('o1')]);
    await expect(
      svc.createObjective({ title: 'Both', year: '2026', quarter: '2026-Q1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.updateObjective('o1', { year: '2026', quarter: '2026-Q1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('a PATCH is judged on the resulting state, not on the payload', async () => {
    const { svc } = makeReadService([objectiveRow('o1', { quarter: '2026-Q1' })]);
    // The row already has a quarter → setting a year alone must still fail.
    await expect(svc.updateObjective('o1', { year: '2026' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // …unless the same PATCH clears the quarter.
    const saved = await svc.updateObjective('o1', { year: '2026', quarter: null });
    expect(saved.year).toBe('2026');
    expect(saved.quarter).toBeNull();
  });

  test('the cascade stops at two levels (annual → quarterly)', async () => {
    const { svc } = makeReadService([
      objectiveRow('annual', { year: '2026' }),
      objectiveRow('q1', { parentId: 'annual' }),
      objectiveRow('loose'),
    ]);
    // `q1` already has a parent → it cannot become one.
    await expect(
      svc.updateObjective('loose', { parentId: 'q1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // `annual` already has children → it cannot become a child.
    await expect(
      svc.updateObjective('annual', { parentId: 'loose' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Self-parenting is the only reachable cycle.
    await expect(
      svc.updateObjective('loose', { parentId: 'loose' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('an unknown parent is a 404, not a silent detach', async () => {
    const { svc } = makeReadService([objectiveRow('o1')]);
    await expect(
      svc.updateObjective('o1', { parentId: 'ghost' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
