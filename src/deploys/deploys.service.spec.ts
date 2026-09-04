import { describe, expect, mock, test } from 'bun:test';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeploysService } from './deploys.service';
import type { Deploy } from './deploy.entity';

function makeMockRepo(rows: Partial<Deploy>[] = []) {
  return {
    find: mock(async ({ where }: any = {}) => {
      return rows.filter((r) => {
        if (where?.env !== undefined && r.env !== where.env) return false;
        if (where?.status !== undefined && r.status !== where.status) return false;
        return true;
      });
    }),
    findOne: mock(async ({ where }: any) => rows.find((r) => r.id === where?.id) ?? null),
    create: mock((x: unknown) => x),
    save: mock(async (x: any) => {
      const idx = rows.findIndex((r) => r.id === x.id);
      if (idx >= 0) rows[idx] = { ...rows[idx], ...x };
      else rows.push(x);
      return x;
    }),
    createQueryBuilder: mock(() => ({
      orderBy: mock(function (this: any) { return this; }),
      getOne: mock(async () => rows[0] ?? null),
    })),
  } as any;
}

function makeMockTicketsRepo(tickets: Array<{ id: number }> = []) {
  return {
    findOne: mock(async ({ where }: any) => tickets.find((t) => t.id === where.id) ?? null),
  } as any;
}

function pendingRow(overrides: Partial<Deploy> = {}): Partial<Deploy> {
  return {
    id: 'd-001',
    app: 'nola-hq-backend',
    version: '1.0.0',
    env: 'production',
    author: 'ci',
    t: 'à l’instant',
    status: 'pending',
    sha: 'abc1234567890',
    changelog: '- fix: something (abc1234)',
    ...overrides,
  };
}

describe('DeploysService — handleRailwayWebhook', () => {
  test('ignores events for non-production environments', async () => {
    const repo = makeMockRepo([pendingRow()]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.succeeded',
      details: { status: 'SUCCESS', commitHash: 'abc1234567890' },
      resource: {
        environment: { name: 'staging' },
        service: { name: 'nola-hq-backend' },
      },
    } as any);

    expect(result).toEqual({ matched: false, ignored: true, reason: 'non_production_environment' });
    expect(repo.save).not.toHaveBeenCalled();
  });

  test('ignores transitional/unrecognized statuses (e.g. BUILDING, QUEUED)', async () => {
    const repo = makeMockRepo([pendingRow()]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.building',
      details: { status: 'BUILDING', commitHash: 'abc1234567890' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'nola-hq-backend' },
      },
    } as any);

    expect(result).toEqual({
      matched: false,
      ignored: true,
      reason: 'transitional_or_unrecognized_status',
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  test('ignores payloads with no commitHash', async () => {
    const repo = makeMockRepo([pendingRow()]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.succeeded',
      details: { status: 'SUCCESS' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'nola-hq-backend' },
      },
    } as any);

    expect(result).toEqual({ matched: false, ignored: true, reason: 'missing_commit_hash' });
    expect(repo.save).not.toHaveBeenCalled();
  });

  test('matches a pending deploy by exact SHA and service name, marks success', async () => {
    const repo = makeMockRepo([pendingRow({ sha: 'abc1234567890' })]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.succeeded',
      details: { status: 'SUCCESS', commitHash: 'abc1234567890' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'nola-hq-backend' },
      },
    } as any);

    expect(result).toEqual({
      matched: true,
      deployId: 'd-001',
      app: 'nola-hq-backend',
      status: 'success',
    });
    expect(repo.save).toHaveBeenCalled();
  });

  test('matches via short-SHA prefix and normalizes hyphenated service names, marks failed on CRASHED', async () => {
    const repo = makeMockRepo([pendingRow({ sha: 'abc1234', app: 'nola-hq' })]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.crashed',
      details: { status: 'CRASHED', commitHash: 'abc1234567890full' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'Nola-HQ' },
      },
    } as any);

    expect(result).toEqual({
      matched: true,
      deployId: 'd-001',
      app: 'nola-hq',
      status: 'failed',
    });
  });

  test('no matching pending deploy — returns matched:false with the sha/service reported rather than throwing or silently dropping', async () => {
    // Railway fires this webhook project-wide: dev pushes and manual
    // redeploys land here too, with no corresponding pending row. That's
    // expected traffic, not an error — but it must come back as an
    // explicit, inspectable "no match" rather than vanish.
    const repo = makeMockRepo([pendingRow({ sha: 'abc1234567890' })]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.succeeded',
      details: { status: 'SUCCESS', commitHash: 'zzz9999999999' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'nola-hq-backend' },
      },
    } as any);

    expect(result).toEqual({
      matched: false,
      message: 'no_matching_pending_deploy',
      service: 'nola-hq-backend',
      sha: 'zzz9999999999',
      status: 'success',
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  test('no matching pending deploy when there are zero pending rows at all (e.g. manual redeploy with nothing queued)', async () => {
    const repo = makeMockRepo([]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.succeeded',
      details: { status: 'SUCCESS', commitHash: 'abc1234567890' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'nola-hq-backend' },
      },
    } as any);

    expect(result.matched).toBe(false);
    expect(result).toMatchObject({ message: 'no_matching_pending_deploy' });
  });

  test('does not cross-match a pending deploy for a different app sharing no name overlap', async () => {
    const repo = makeMockRepo([pendingRow({ sha: 'abc1234567890', app: 'nola-hq' })]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const result = await svc.handleRailwayWebhook({
      type: 'Deployment.succeeded',
      details: { status: 'SUCCESS', commitHash: 'abc1234567890' },
      resource: {
        environment: { name: 'production' },
        service: { name: 'kelasi-gateway' },
      },
    } as any);

    expect(result.matched).toBe(false);
  });
});

describe('DeploysService — secret validation', () => {
  test('validateDeploySecret throws when DEPLOY_WEBHOOK_SECRET is not configured, even if a secret is provided', () => {
    const svc = new DeploysService(makeMockRepo(), makeMockTicketsRepo(), new ConfigService({}));
    expect(() => svc.validateDeploySecret('anything')).toThrow(UnauthorizedException);
  });

  test('validateDeploySecret throws on a mismatched secret', () => {
    const svc = new DeploysService(
      makeMockRepo(),
      makeMockTicketsRepo(),
      new ConfigService({ DEPLOY_WEBHOOK_SECRET: 'expected-secret' }),
    );
    expect(() => svc.validateDeploySecret('wrong-secret')).toThrow(UnauthorizedException);
  });

  test('validateDeploySecret passes on a matching secret', () => {
    const svc = new DeploysService(
      makeMockRepo(),
      makeMockTicketsRepo(),
      new ConfigService({ DEPLOY_WEBHOOK_SECRET: 'expected-secret' }),
    );
    expect(() => svc.validateDeploySecret('expected-secret')).not.toThrow();
  });

  test('validateRailwaySecret throws when RAILWAY_WEBHOOK_SECRET is not configured', () => {
    const svc = new DeploysService(makeMockRepo(), makeMockTicketsRepo(), new ConfigService({}));
    expect(() => svc.validateRailwaySecret('anything')).toThrow(UnauthorizedException);
  });

  test('validateRailwaySecret passes on a matching secret', () => {
    const svc = new DeploysService(
      makeMockRepo(),
      makeMockTicketsRepo(),
      new ConfigService({ RAILWAY_WEBHOOK_SECRET: 'railway-secret' }),
    );
    expect(() => svc.validateRailwaySecret('railway-secret')).not.toThrow();
  });
});

describe('DeploysService — createFromWebhook', () => {
  test('defaults status to pending and env to production', async () => {
    const repo = makeMockRepo([]);
    const svc = new DeploysService(repo, makeMockTicketsRepo(), new ConfigService({}));

    const saved = await svc.createFromWebhook({
      app: 'nola-hq-backend',
      version: '1.2.3',
      author: 'ci',
      sha: 'abc1234',
      changelog: '- feat: x',
    } as any);

    expect(saved.status).toBe('pending');
    expect(saved.env).toBe('production');
  });
});

describe('DeploysService (ticket link)', () => {
  const tickets = [{ id: 42, category: 'deployment', assignee: 'ikamaaurel' }];

  function makeService(deployRows: any[] = []) {
    return new DeploysService(makeMockRepo(deployRows), makeMockTicketsRepo(tickets), new ConfigService({}));
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
