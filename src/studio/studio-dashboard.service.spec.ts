import { test, expect, describe, mock, beforeEach, afterEach, setSystemTime } from 'bun:test';
import { StudioDashboardService } from './studio-dashboard.service';

function repo(rows: unknown[]) {
  return { find: mock(async () => rows) } as any;
}

describe('StudioDashboardService', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  beforeEach(() => setSystemTime(now));
  afterEach(() => setSystemTime());

  test('defaults to YTD and returns both sections, cost folding in Section B spend', async () => {
    const projects = [
      { type: 'infrastructure_cloud', priority: 'high', healthStatus: 'behind', budget: null, cost: null, startDate: null, dueDate: null },
    ];
    const tasks: unknown[] = [];
    const expenses = [
      { amountCents: 43702, currency: 'USD', category: 'domains_saas', paidByEmail: 'a@nola.dev', date: '2026-03-01', status: 'paid' },
    ];
    const domains: unknown[] = [];
    const recurring: unknown[] = [];

    const svc = new StudioDashboardService(
      repo(projects),
      repo(tasks),
      repo(expenses),
      repo(domains),
      repo(recurring),
    );
    const result = await svc.get();

    expect(result.period).toEqual({ start: '2026-01-01', end: '2026-08-04', label: '2026-01-01 → 2026-08-04' });
    expect(result.sectionA.stats.projects).toBe(1);
    expect(result.sectionA.stats.cost).toBe(437.02);
    expect(result.sectionB.stats.spendInPeriodCents).toBe(43702);
  });

  test('honours explicit period/year/month query params', async () => {
    const svc = new StudioDashboardService(repo([]), repo([]), repo([]), repo([]), repo([]));
    const result = await svc.get({ period: 'month', year: 2026, month: 2 });
    expect(result.period).toEqual({ start: '2026-02-01', end: '2026-02-28', label: '2026-02-01 → 2026-02-28' });
  });
});
