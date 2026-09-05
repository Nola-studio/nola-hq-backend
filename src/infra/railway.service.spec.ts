import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { RailwayService, RAILWAY_PRO_RATES } from './railway.service';
import { ConfigService } from '@nestjs/config';

describe('RailwayService (Workspace Token & Real Metrics)', () => {
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

  it('exposes verifiable pricing source URL and date', () => {
    expect(RAILWAY_PRO_RATES.source).toBe('https://railway.com/pricing');
    expect(RAILWAY_PRO_RATES.asOf).toBe('2026-09-03');
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

  it('reports "error" loudly when Railway API rejects the token', async () => {
    process.env.RAILWAY_TOKEN = 'mock_bad_token';
    const config = new ConfigService();
    service = new RailwayService(config);

    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          errors: [{ message: 'Not Authorized', path: ['apiToken'] }],
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

  it('reports "connected" with workspace name, billing total, and computed project estimates', async () => {
    process.env.RAILWAY_TOKEN = 'mock_valid_workspace_token';
    const config = new ConfigService();
    service = new RailwayService(config);

    globalThis.fetch = mock(async (_url, opts: any) => {
      const body = JSON.parse(opts.body);
      if (body.query.includes('GetWorkspaceData')) {
        return new Response(
          JSON.stringify({
            data: {
              apiToken: {
                workspaces: [
                  {
                    id: 'ws-123',
                    name: 'NolaaStudio-npr',
                  },
                ],
              },
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
              estimatedUsage: [
                { projectId: 'proj-1', measurement: 'CPU_USAGE_2', estimatedValue: 100.0 },
                { projectId: 'proj-1', measurement: 'MEMORY_USAGE_GB', estimatedValue: 200000.0 },
                { projectId: 'proj-1', measurement: 'DISK_USAGE_GB', estimatedValue: 50000.0 },
                { projectId: 'proj-1', measurement: 'NETWORK_TX_GB', estimatedValue: 1.0 },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (body.query.includes('GetWorkspaceBillingDetails')) {
        return new Response(
          JSON.stringify({
            data: {
              workspace: {
                id: 'ws-123',
                name: 'NolaaStudio-npr',
                plan: 'PRO',
                customer: {
                  currentUsage: 45.39,
                  creditBalance: 0,
                  billingPeriod: {
                    start: '2026-08-19T04:44:50.000Z',
                    end: '2026-09-19T04:44:50.000Z',
                  },
                  usageLimit: {
                    hardLimit: 75,
                    softLimit: 70,
                    isOverLimit: false,
                  },
                  subscriptions: [
                    {
                      nextInvoiceCurrentTotal: 4515,
                      nextInvoiceDate: '2026-09-19T04:44:50.000Z',
                      status: 'active',
                      items: [{ priceDollars: 20 }],
                    },
                  ],
                },
              },
              agentUsage: {
                totalUsedCents: 0,
                hardLimitCents: 2000,
                softLimitCents: 0,
              },
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
    expect(res.totalCostUsd).toBe(45.39);
    expect(res.billing?.plan).toBe('PRO');
    expect(res.billing?.baseFeeUsd).toBe(20);
    expect(res.billing?.computeLimit?.hardLimitUsd).toBe(75);
    expect(res.billing?.agentLimit?.hardLimitUsd).toBe(20);
    expect(res.projects.length).toBe(1);
    expect(res.projects[0].name).toBe('Nola-Core');
    expect(res.projects[0].estimatedCostUsd).toBeGreaterThan(20);
    expect(res.error).toBeNull();
  });
});
