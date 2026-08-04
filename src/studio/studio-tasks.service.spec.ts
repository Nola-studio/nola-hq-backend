import { test, expect, describe, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import type { StudioTaskStatus } from './studio-task.entity';

// `StudioTasksService` imports `StudioNotifyService`, which imports
// `NolaClientService` from `@nola-hq/nola-sdk` — that package's barrel
// pulls in `@nola-studio/sdk`'s `auth` submodule (jose, ESM-only), which
// bun's CJS-based test runner can't `require()`. Stubbed here since these
// tests never touch NATS; real DI still gets the real class at runtime.
mock.module('@nola-hq/nola-sdk', () => ({ NolaClientService: class {} }));

const { StudioTasksService } = await import('./studio-tasks.service');

/**
 * `move` wiring: the reordering plan is computed by `planMove` (unit-tested
 * in studio.board.spec.ts) — here we check the service persists exactly the
 * touched rows and nothing else. Repositories are mocked the way
 * roadmap.service.spec.ts does: no DB, no Nest container.
 */

interface Row {
  id: string;
  status: StudioTaskStatus;
  position: number;
  completedAt: Date | null;
  identifier?: string;
  projectId?: string;
}

function row(id: string, status: StudioTaskStatus, position: number): Row {
  return { id, status, position, completedAt: null };
}

function makeTasksRepo(rows: Row[]) {
  return {
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    find: mock(async () => rows.map((r) => ({ ...r }))),
    save: mock(async (x: unknown) => x),
    create: mock((x: unknown) => x),
    count: mock(async () => rows.length),
    remove: mock(async (x: unknown) => x),
  } as any;
}

const noProjects = { findOne: mock(async () => null) } as any;

function makeNotify() {
  return { taskAssigned: mock(async () => {}) } as any;
}

function makeService(tasks: any, projects: any = noProjects, notify: any = makeNotify()) {
  return new StudioTasksService(tasks, projects, notify);
}

/** The `{id,status,position}` triples handed to `save`, id-sorted. */
function persisted(repo: any) {
  const [items] = repo.save.mock.calls[0] as [Row[]];
  return items
    .map((i) => ({ id: i.id, status: i.status, position: i.position }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describe('StudioTasksService.move', () => {
  test('reorders within a column and saves every shifted card once', async () => {
    const rows = [row('a', 'backlog', 0), row('b', 'backlog', 1), row('c', 'backlog', 2)];
    const repo = makeTasksRepo(rows);
    const svc = makeService(repo);

    await svc.move('c', { status: 'backlog', position: 0 });

    expect(repo.save).toHaveBeenCalledTimes(1); // one write → one transaction
    expect(persisted(repo)).toEqual([
      { id: 'a', status: 'backlog', position: 1 },
      { id: 'b', status: 'backlog', position: 2 },
      { id: 'c', status: 'backlog', position: 0 },
    ]);
  });

  test('sets completedAt when a task is dragged into done', async () => {
    const rows = [row('a', 'in_progress', 0)];
    const repo = makeTasksRepo(rows);
    const svc = makeService(repo);

    await svc.move('a', { status: 'done', position: 0 });

    const [[touched]] = repo.save.mock.calls as [Row[]][];
    expect(touched[0].completedAt).not.toBeNull();
  });

  test('clears completedAt when a done task is dragged back out', async () => {
    const rows = [{ ...row('a', 'done', 0), completedAt: new Date('2026-01-01') }];
    const repo = makeTasksRepo(rows);
    const svc = makeService(repo);

    await svc.move('a', { status: 'backlog', position: 0 });

    const [[touched]] = repo.save.mock.calls as [Row[]][];
    expect(touched[0].completedAt).toBeNull();
  });

  test('does not write anything for a no-op move', async () => {
    const rows = [row('a', 'backlog', 0)];
    const repo = makeTasksRepo(rows);
    const svc = makeService(repo);

    await svc.move('a', { status: 'backlog', position: 0 });

    expect(repo.save).not.toHaveBeenCalled();
  });

  test('throws NotFoundException for an unknown task', async () => {
    const repo = makeTasksRepo([]);
    const svc = makeService(repo);
    await expect(svc.move('missing', { status: 'done', position: 0 })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('StudioTasksService.create', () => {
  test('assigns the next sequential identifier for the project', async () => {
    const tasksRepo = makeTasksRepo([]);
    tasksRepo.find = mock(async () => [{ identifier: 'YEK-1' }, { identifier: 'YEK-4' }]);
    const projectsRepo = { findOne: mock(async () => ({ id: 'p1', key: 'YEK' })) } as any;
    const svc = makeService(tasksRepo, projectsRepo);

    await svc.create(
      { projectId: 'p1', title: 'Ship it', category: 'product' } as any,
      'staff@nola.dev',
    );

    expect(tasksRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'YEK-5', createdByEmail: 'staff@nola.dev' }),
    );
  });

  test('rejects when the project does not exist', async () => {
    const tasksRepo = makeTasksRepo([]);
    const svc = makeService(tasksRepo, noProjects);

    await expect(
      svc.create({ projectId: 'missing', title: 'X', category: 'product' } as any, 'a@b.co'),
    ).rejects.toThrow(NotFoundException);
  });

  test('notifies the assignee when a task is created pre-assigned', async () => {
    const tasksRepo = makeTasksRepo([]);
    const projectsRepo = { findOne: mock(async () => ({ id: 'p1', key: 'YEK' })) } as any;
    const notify = makeNotify();
    const svc = makeService(tasksRepo, projectsRepo, notify);

    await svc.create(
      { projectId: 'p1', title: 'Ship it', category: 'product', assigneeEmail: 'a@nola.dev' } as any,
      'staff@nola.dev',
    );

    expect(notify.taskAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'YEK-1', assigneeEmail: 'a@nola.dev' }),
    );
  });
});

describe('StudioTasksService.update', () => {
  test('notifies only when assigneeEmail actually changes', async () => {
    const rows = [{ ...row('a', 'backlog', 0), identifier: 'YEK-1', assigneeEmail: null }] as any[];
    const tasksRepo = makeTasksRepo(rows);
    const notify = makeNotify();
    const svc = makeService(tasksRepo, noProjects, notify);

    await svc.update('a', { assigneeEmail: 'a@nola.dev' } as any);
    expect(notify.taskAssigned).toHaveBeenCalledTimes(1);

    rows[0].assigneeEmail = 'a@nola.dev';
    await svc.update('a', { title: 'Renamed' } as any);
    expect(notify.taskAssigned).toHaveBeenCalledTimes(1); // unchanged assignee → no new call
  });
});
