import { test, expect, describe, mock } from 'bun:test';
import { ConflictException } from '@nestjs/common';
import { StudioService } from './studio.service';

interface Row {
  id: string;
  name: string;
  key: string;
  status: string;
  createdAt: Date;
}

function makeProjectsRepo(rows: Row[] = [], opts: { failKeys?: string[] } = {}) {
  let seq = 0;
  return {
    insert: mock(async (entity: any) => {
      if (rows.some((r) => r.key === entity.key) || opts.failKeys?.includes(entity.key)) {
        const err = new Error(`duplicate key value violates unique constraint "UQ_studio_projects_key"`) as any;
        err.code = '23505';
        throw err;
      }
      rows.push({ id: `p${++seq}`, ...entity });
    }),
    create: mock((x: unknown) => x),
    save: mock(async (entity: any) => {
      if (rows.some((r) => r.key === entity.key)) {
        const err = new Error(`duplicate key value violates unique constraint "UQ_studio_projects_key"`) as any;
        err.code = '23505';
        throw err;
      }
      const saved = { id: `p${++seq}`, ...entity };
      rows.push(saved);
      return saved;
    }),
    findOne: mock(async ({ where }: any) => rows.find((r) => r.key === where.key) ?? null),
    find: mock(async () => [...rows].sort((a, b) => a.key.localeCompare(b.key))),
  } as any;
}

describe('StudioService.onModuleInit', () => {
  test('seeds the three default projects on an empty table', async () => {
    const repo = makeProjectsRepo([]);
    const svc = new StudioService(repo);
    await svc.onModuleInit();
    expect(repo.insert.mock.calls.length).toBe(3);
    const keys = (await svc.listProjects()).map((p: any) => p.key).sort();
    expect(keys).toEqual(['NOLA', 'STU', 'YEK']);
  });

  test('is a no-op (does not throw) when all three already exist', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', status: 'active', createdAt: new Date() },
      { id: 'p2', name: 'Nola', key: 'NOLA', status: 'active', createdAt: new Date() },
      { id: 'p3', name: 'Studio', key: 'STU', status: 'active', createdAt: new Date() },
    ]);
    const svc = new StudioService(repo);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    expect(await svc.listProjects()).toHaveLength(3);
  });

  test('a partial seed (simulating a lost race on one key) still inserts the others', async () => {
    // Only YEK already exists — NOLA/STU should still land, not be skipped
    // just because the bulk-insert-style old implementation would have
    // aborted the whole statement on the first conflict.
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', status: 'active', createdAt: new Date() },
    ]);
    const svc = new StudioService(repo);
    await svc.onModuleInit();
    const keys = (await svc.listProjects()).map((p: any) => p.key).sort();
    expect(keys).toEqual(['NOLA', 'STU', 'YEK']);
  });

  test('a non-conflict error from insert still propagates', async () => {
    const repo = makeProjectsRepo([]);
    repo.insert = mock(async () => {
      throw new Error('connection refused');
    });
    const svc = new StudioService(repo);
    await expect(svc.onModuleInit()).rejects.toThrow('connection refused');
  });
});

describe('StudioService.createProject', () => {
  test('creates a project with a normalized key', async () => {
    const repo = makeProjectsRepo([]);
    const svc = new StudioService(repo);
    const created = await svc.createProject({ key: 'ACME', name: 'Acme' } as any);
    expect(created).toMatchObject({ key: 'ACME', name: 'Acme', status: 'active' });
  });

  test('rejects a duplicate key with a friendly conflict', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', status: 'active', createdAt: new Date() },
    ]);
    const svc = new StudioService(repo);
    await expect(svc.createProject({ key: 'YEK', name: 'Yeko 2' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  test('translates a race that slips past the pre-check into a conflict too', async () => {
    const repo = makeProjectsRepo([]);
    // findOne says free, but save() hits the unique constraint anyway —
    // another request won the race between the two calls.
    repo.save = mock(async () => {
      const err = new Error('duplicate key value violates unique constraint') as any;
      err.code = '23505';
      throw err;
    });
    const svc = new StudioService(repo);
    await expect(svc.createProject({ key: 'YEK', name: 'Yeko' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
