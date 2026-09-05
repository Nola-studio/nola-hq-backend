import { describe, expect, test, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { DeploysService } from './deploys.service';

describe('DeploysService (ticket link)', () => {
  const tickets = [{ id: 42, category: 'deployment', assignee: 'ikamaaurel' }];

  function makeService(deployRows: any[] = []) {
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

    return new DeploysService(deployRepo, ticketsRepo);
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
