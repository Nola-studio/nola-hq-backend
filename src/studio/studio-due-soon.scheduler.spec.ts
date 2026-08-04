import { test, expect, describe, mock, beforeEach, afterEach, setSystemTime } from 'bun:test';

// See studio-tasks.service.spec.ts for why: this scheduler imports
// StudioNotifyService → @nola-hq/nola-sdk, whose barrel drags in an
// ESM-only `jose` import bun's test runner can't require.
mock.module('@nola-hq/nola-sdk', () => ({ NolaClientService: class {} }));

const { StudioDueSoonScheduler } = await import('./studio-due-soon.scheduler');

describe('StudioDueSoonScheduler', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  beforeEach(() => setSystemTime(now));
  afterEach(() => setSystemTime());

  test('notifies for a task due within 48h and records the dedup row', async () => {
    const task = {
      id: 'task-1',
      identifier: 'YEK-1',
      title: 'Ship it',
      assigneeEmail: 'a@nola.dev',
      dueDate: '2026-08-16',
    };
    const tasksRepo = { find: mock(async () => [task]) } as any;
    const dedupsRepo = {
      create: mock((x: unknown) => x),
      save: mock(async (x: unknown) => x),
    } as any;
    const notify = { taskDueSoon: mock(async () => {}) } as any;

    const scheduler = new StudioDueSoonScheduler(tasksRepo, dedupsRepo, notify);
    await scheduler.run();

    expect(dedupsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', kind: 'due_soon', sentOn: '2026-08-15' }),
    );
    expect(notify.taskDueSoon).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'YEK-1', assigneeEmail: 'a@nola.dev' }),
    );
  });

  test('skips a task already notified today (dedup unique constraint violation)', async () => {
    const task = { id: 'task-1', identifier: 'YEK-1', title: 'Ship it', assigneeEmail: 'a@nola.dev', dueDate: '2026-08-16' };
    const tasksRepo = { find: mock(async () => [task]) } as any;
    const dedupsRepo = {
      create: mock((x: unknown) => x),
      save: mock(async () => {
        throw new Error('Unique constraint failed');
      }),
    } as any;
    const notify = { taskDueSoon: mock(async () => {}) } as any;

    const scheduler = new StudioDueSoonScheduler(tasksRepo, dedupsRepo, notify);
    await scheduler.run();

    expect(notify.taskDueSoon).not.toHaveBeenCalled();
  });

  test('skips tasks with no assignee or due beyond the 48h window', async () => {
    const tasksRepo = {
      find: mock(async () => [
        { id: 't1', identifier: 'YEK-1', title: 'A', assigneeEmail: null, dueDate: '2026-08-16' },
        { id: 't2', identifier: 'YEK-2', title: 'B', assigneeEmail: 'a@nola.dev', dueDate: '2026-09-01' },
      ]),
    } as any;
    const dedupsRepo = { create: mock((x: unknown) => x), save: mock(async (x: unknown) => x) } as any;
    const notify = { taskDueSoon: mock(async () => {}) } as any;

    const scheduler = new StudioDueSoonScheduler(tasksRepo, dedupsRepo, notify);
    await scheduler.run();

    expect(notify.taskDueSoon).not.toHaveBeenCalled();
  });
});
