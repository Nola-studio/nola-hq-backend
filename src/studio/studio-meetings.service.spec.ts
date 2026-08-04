import { test, expect, describe, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { StudioMeetingsService } from './studio-meetings.service';

function makeMeetingsRepo(rows: any[] = []) {
  return {
    find: mock(async () => rows.map((r) => ({ ...r }))),
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null),
    create: mock((x: unknown) => x),
    save: mock(async (x: unknown) => x),
    remove: mock(async (x: unknown) => x),
  } as any;
}

const emptyTasksRepo = { find: mock(async () => []) } as any;

describe('StudioMeetingsService', () => {
  test('defaults participants to an empty array on create', async () => {
    const meetings = makeMeetingsRepo();
    const tasksSvc = { create: mock() } as any;
    const svc = new StudioMeetingsService(meetings, emptyTasksRepo, tasksSvc);

    await svc.create({ date: '2026-08-10', title: 'Réunion hebdo' } as any);

    expect(meetings.save).toHaveBeenCalledWith(expect.objectContaining({ participants: [] }));
  });

  test('throws NotFoundException when the meeting does not exist', async () => {
    const meetings = makeMeetingsRepo();
    const tasksSvc = { create: mock() } as any;
    const svc = new StudioMeetingsService(meetings, emptyTasksRepo, tasksSvc);

    await expect(svc.update('missing', { title: 'X' } as any)).rejects.toThrow(NotFoundException);
    await expect(svc.createTask('missing', {} as any, 'staff@nola.dev')).rejects.toThrow(NotFoundException);
  });

  test('creates a task pre-linked to the meeting via StudioTasksService', async () => {
    const meetings = makeMeetingsRepo([{ id: 'meet-1' }]);
    const tasksSvc = { create: mock(async () => ({ id: 'task-1', meetingId: 'meet-1' })) } as any;
    const svc = new StudioMeetingsService(meetings, emptyTasksRepo, tasksSvc);

    const dto = { projectId: 'proj-1', title: 'Suivre X', category: 'product' };
    const result = await svc.createTask('meet-1', dto as any, 'staff@nola.dev');

    expect(tasksSvc.create).toHaveBeenCalledWith({ ...dto, meetingId: 'meet-1' }, 'staff@nola.dev');
    expect(result).toEqual({ id: 'task-1', meetingId: 'meet-1' });
  });

  test('findOne hydrates the meeting with its linked tasks', async () => {
    const meetings = makeMeetingsRepo([{ id: 'meet-1', title: 'Hebdo' }]);
    const tasksRepo = { find: mock(async () => [{ id: 'task-1', identifier: 'YEK-1' }]) } as any;
    const tasksSvc = { create: mock() } as any;
    const svc = new StudioMeetingsService(meetings, tasksRepo, tasksSvc);

    const result = await svc.findOne('meet-1');

    expect(result.tasks).toEqual([{ id: 'task-1', identifier: 'YEK-1' }]);
  });
});
