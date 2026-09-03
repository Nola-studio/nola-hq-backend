import { describe, expect, test, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { DeploysService } from './deploys.service';

describe('DeploysService (ticket link)', () => {
  const tickets = [{ id: 42, category: 'deployment', assignee: 'ikamaaurel' }];

  function makeService(deployRows: any[] = [], githubMock?: any) {
    const deployRepo = {
      find: mock(async () => deployRows),
      findOne: mock(async ({ where }: any) => deployRows.find((d) => d.id === where.id) ?? null),
      create: mock((d: any) => d),
      save: mock(async (d: any) => {
        deployRows.push(d);
        return d;
      }),
      createQueryBuilder: mock(() => ({
        orderBy: mock().mockReturnThis(),
        getOne: mock(async () => deployRows[deployRows.length - 1] ?? null),
      })),
    } as any;

    const ticketsRepo = {
      findOne: mock(async ({ where }: any) => tickets.find((t) => t.id === where.id) ?? null),
    } as any;

    const github = githubMock ?? { commitRange: mock(async () => null) };
    return new DeploysService(deployRepo, ticketsRepo, github);
  }

  test('creates a deploy linked to an existing deployment ticket', async () => {
    const svc = makeService();
    const deploy = await svc.create({
      app: 'nola-hq',
      version: '1.2.3',
      env: 'production',
      author: 'aurel',
      sha: 'abc123',
      changelog: 'fix things',
      ticketId: 42,
    });
    expect(deploy.ticketId).toBe(42);
  });

  test('rejects a ticketId that does not exist', async () => {
    const svc = makeService();
    await expect(
      svc.create({
        app: 'nola-hq',
        version: '1.2.3',
        env: 'production',
        author: 'aurel',
        sha: 'abc123',
        changelog: 'fix things',
        ticketId: 999,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  test('ticketId stays optional — dev deploys need no ticket', async () => {
    const svc = makeService();
    const deploy = await svc.create({
      app: 'nola-hq',
      version: '1.2.3',
      env: 'dev',
      author: 'aurel',
      sha: 'abc123',
      changelog: 'fix things',
    });
    expect(deploy.ticketId).toBeNull();
  });
});

describe('DeploysService.commitRanges (deployment ticket composer)', () => {
  function makeService(githubMock: any) {
    const deployRepo = {} as any;
    const ticketsRepo = {} as any;
    return new DeploysService(deployRepo, ticketsRepo, githubMock);
  }

  test('unknown app -> error entry, not a thrown exception', async () => {
    const svc = makeService({ commitRange: mock(async () => null) });
    const [result] = await svc.commitRanges(['not-a-real-app']);
    expect(result.repo).toBeNull();
    expect(result.error).toContain("Unknown app 'not-a-real-app'");
  });

  test('known app, GitHub configured -> resolves the compare range', async () => {
    const commitRange = mock(async () => ({
      baseSha: 'main-sha',
      headSha: 'dev-sha',
      aheadBy: 3,
      commits: [{ sha: 'dev-sha', message: 'fix', author: 'aurel', date: '2026-01-01' }],
      compareUrl: 'https://github.com/Nola-studio/nola-hq-backend/compare/main...dev',
    }));
    const svc = makeService({ commitRange });
    const [result] = await svc.commitRanges(['nola-hq-backend']);
    expect(commitRange).toHaveBeenCalledWith('Nola-studio/nola-hq-backend');
    expect(result.repo).toBe('Nola-studio/nola-hq-backend');
    expect(result.aheadBy).toBe(3);
    expect(result.error).toBeUndefined();
  });

  test('known app, GitHub unreachable -> error entry, not a thrown exception', async () => {
    const svc = makeService({ commitRange: mock(async () => null) });
    const [result] = await svc.commitRanges(['nola-hq']);
    expect(result.repo).toBe('Nola-studio/nola-hq');
    expect(result.error).toBeTruthy();
  });

  test('one bad app does not stop the others from resolving', async () => {
    const commitRange = mock(async (repo: string) =>
      repo === 'Nola-studio/nola-hq-backend'
        ? { baseSha: 'a', headSha: 'b', aheadBy: 1, commits: [], compareUrl: 'x' }
        : null,
    );
    const svc = makeService({ commitRange });
    const results = await svc.commitRanges(['nola-hq-backend', 'unknown-app']);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toContain("Unknown app 'unknown-app'");
  });
});
