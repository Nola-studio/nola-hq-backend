import { test, expect, describe, mock } from 'bun:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { StudioService } from './studio.service';

interface ProjectRow {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: 'active' | 'archived';
  color: string;
  ownerEmail: string | null;
  createdAt: Date;
}

function makeProjectsRepo(rows: ProjectRow[] = []) {
  let seq = 0;
  return {
    create: mock((x: unknown) => x),
    save: mock(async (entity: any) => {
      if (!entity.id) {
        if (rows.some((r) => r.key === entity.key)) {
          const err = new Error('duplicate key value violates unique constraint') as any;
          err.code = '23505';
          throw err;
        }
        const saved = { id: `p${++seq}`, ...entity };
        rows.push(saved);
        return saved;
      }
      const idx = rows.findIndex((r) => r.id === entity.id);
      rows[idx] = entity;
      return entity;
    }),
    findOne: mock(async ({ where }: any) => {
      if (where.id) return rows.find((r) => r.id === where.id) ?? null;
      if (where.key) return rows.find((r) => r.key === where.key) ?? null;
      return null;
    }),
    find: mock(async () => [...rows].sort((a, b) => a.key.localeCompare(b.key))),
  } as any;
}

function makeTasksRepo(openCountByProject: Record<string, number> = {}) {
  return {
    count: mock(async ({ where }: any) => openCountByProject[where.projectId] ?? 0),
  } as any;
}

const baseInput = { key: 'ACME', name: 'Acme', color: '#4F46E5' };

describe('StudioService.createProject', () => {
  test('creates a project with a normalized key and no seed side effects', async () => {
    const repo = makeProjectsRepo([]);
    const svc = new StudioService(repo, makeTasksRepo());
    const created = await svc.createProject(baseInput as any);
    expect(created).toMatchObject({ key: 'ACME', name: 'Acme', status: 'active', color: '#4F46E5' });
    expect(await svc.listProjects()).toHaveLength(1);
  });

  test('rejects a duplicate key with a friendly conflict', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', description: null, status: 'active', color: '#000', ownerEmail: null, createdAt: new Date() },
    ]);
    const svc = new StudioService(repo, makeTasksRepo());
    await expect(svc.createProject({ ...baseInput, key: 'YEK' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  test('translates a race that slips past the pre-check into a conflict too', async () => {
    const repo = makeProjectsRepo([]);
    repo.save = mock(async () => {
      const err = new Error('duplicate key value violates unique constraint') as any;
      err.code = '23505';
      throw err;
    });
    const svc = new StudioService(repo, makeTasksRepo());
    await expect(svc.createProject(baseInput as any)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StudioService.updateProject', () => {
  test('updates the provided fields, leaves key/status untouched', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', description: null, status: 'active', color: '#000', ownerEmail: null, createdAt: new Date() },
    ]);
    const svc = new StudioService(repo, makeTasksRepo());
    const updated = await svc.updateProject('p1', { name: 'Yekoli', color: '#16A34A' } as any);
    expect(updated).toMatchObject({ key: 'YEK', name: 'Yekoli', color: '#16A34A', status: 'active' });
  });

  test('404s on an unknown project', async () => {
    const svc = new StudioService(makeProjectsRepo([]), makeTasksRepo());
    await expect(svc.updateProject('missing', {} as any)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('StudioService.archiveProject', () => {
  test('archives a project with no open tasks', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', description: null, status: 'active', color: '#000', ownerEmail: null, createdAt: new Date() },
    ]);
    const svc = new StudioService(repo, makeTasksRepo({ p1: 0 }));
    const archived = await svc.archiveProject('p1');
    expect(archived.status).toBe('archived');
  });

  test('blocks archiving a project with open (non-done) tasks', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', description: null, status: 'active', color: '#000', ownerEmail: null, createdAt: new Date() },
    ]);
    const svc = new StudioService(repo, makeTasksRepo({ p1: 3 }));
    await expect(svc.archiveProject('p1')).rejects.toBeInstanceOf(ConflictException);
  });

  test('archiving an already-archived project is a no-op, not an error', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', description: null, status: 'archived', color: '#000', ownerEmail: null, createdAt: new Date() },
    ]);
    const svc = new StudioService(repo, makeTasksRepo({ p1: 5 }));
    const result = await svc.archiveProject('p1');
    expect(result.status).toBe('archived');
  });
});

describe('StudioService.unarchiveProject', () => {
  test('reactivates an archived project', async () => {
    const repo = makeProjectsRepo([
      { id: 'p1', name: 'Yeko', key: 'YEK', description: null, status: 'archived', color: '#000', ownerEmail: null, createdAt: new Date() },
    ]);
    const svc = new StudioService(repo, makeTasksRepo());
    const result = await svc.unarchiveProject('p1');
    expect(result.status).toBe('active');
  });
});
