import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { RailwayService } from './railway.service';
import { ConfigService } from '@nestjs/config';

describe('RailwayService (3-State Health & Raw Metrics)', () => {
  let service: RailwayService;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    delete process.env.RAILWAY_TOKEN;
    delete process.env.RAILWAY_API_TOKEN;
    delete process.env.RAILWAY_WORKSPACE_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reports "unconfigured" when no RAILWAY_TOKEN is present', async () => {
    const config = new ConfigService();
    service = new RailwayService(config);

    const res = await service.getUsage(true);
    expect(res.status).toBe('unconfigured');
    expect(res.configured).toBe(false);
    expect(res.totalCostUsd).toBe(0);
    expect(res.projects).toEqual([]);
    expect(res.error).toContain('non configuré');
  });

  it('reports "error" loudly when Railway API rejects the token (Not Authorized)', async () => {
    process.env.RAILWAY_TOKEN = 'mock_bad_token';
    const config = new ConfigService();
    service = new RailwayService(config);

    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          errors: [{ message: 'Not Authorized', path: ['me'] }],
          data: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    const res = await service.getUsage(true);
    expect(res.status).toBe('error');
    expect(res.configured).toBe(true);
    expect(res.error).toBe('Not Authorized');
    expect(res.projects).toEqual([]);
  });

  it('reports "connected" with workspace info and raw project metrics upon success', async () => {
    process.env.RAILWAY_TOKEN = 'mock_valid_workspace_token';
    const config = new ConfigService();
    service = new RailwayService(config);

    let callCount = 0;
    globalThis.fetch = mock(async (_url, opts: any) => {
      callCount++;
      const body = JSON.parse(opts.body);
      if (body.query.includes('GetProjectsAndBilling')) {
        return new Response(
          JSON.stringify({
            data: {
              me: {
                name: 'NolaaStudio-npr',
                projects: {
                  edges: [
                    {
                      node: {
                        id: 'proj-1',
                        name: 'Nola-Core',
                        services: {
                          edges: [{ node: { id: 'svc-1', name: 'nola-hq-backend' } }],
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.query.includes('GetEstimatedUsage')) {
        return new Response(
          JSON.stringify({
            data: {
              estimatedUsage: [
                { projectId: 'proj-1', measurement: 'CPU_USAGE_2', estimatedValue: 12.5 },
                { projectId: 'proj-1', measurement: 'MEMORY_USAGE_GB', estimatedValue: 34.2 },
                { projectId: 'proj-1', measurement: 'DISK_USAGE_GB', estimatedValue: 10.0 },
                { projectId: 'proj-1', measurement: 'NETWORK_TX_GB', estimatedValue: 1.8 },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 200 });
    }) as any;

    const res = await service.getUsage(true);
    expect(res.status).toBe('connected');
    expect(res.configured).toBe(true);
    expect(res.workspaceName).toBe('NolaaStudio-npr');
    expect(res.projects.length).toBe(1);
    expect(res.projects[0].name).toBe('Nola-Core');
    expect(res.projects[0].metrics.cpuHours).toBe(12.5);
    expect(res.projects[0].metrics.memoryGbHours).toBe(34.2);
    expect(res.projects[0].metrics.diskGb).toBe(10);
    expect(res.projects[0].metrics.networkTxGb).toBe(1.8);
    expect(res.error).toBeNull();
  });
});
