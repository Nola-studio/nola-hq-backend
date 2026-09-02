import { test, expect, describe, mock } from 'bun:test';
import { RailwayService } from './railway.service';

describe('RailwayService', () => {
  test('returns configured: false when RAILWAY_API_TOKEN is not set', async () => {
    const config = { get: mock(() => null) } as any;
    const svc = new RailwayService(config);

    const result = await svc.getUsage();
    expect(result.configured).toBe(false);
    expect(result.projects).toEqual([]);
    expect(result.totalCostUsd).toBe(0);
    expect(result.error).toContain('RAILWAY_API_TOKEN');
  });

  test('caches the response when called multiple times within TTL', async () => {
    const config = { get: mock(() => 'fake-token') } as any;
    const svc = new RailwayService(config);

    // Mock internal fetchProjects
    (svc as any).fetchProjects = mock(async () => [
      {
        id: 'proj-1',
        name: 'Nola Studio Prod',
        servicesCount: 2,
        estimatedCostUsd: 15.5,
        services: [{ id: 'srv-1', name: 'api' }, { id: 'srv-2', name: 'db' }],
      },
    ]);

    const res1 = await svc.getUsage();
    expect(res1.configured).toBe(true);
    expect(res1.totalCostUsd).toBe(15.5);
    expect(res1.projects.length).toBe(1);

    const res2 = await svc.getUsage();
    expect((svc as any).fetchProjects).toHaveBeenCalledTimes(1);
    expect(res2).toBe(res1);
  });
});
