import { test, expect, describe, mock, beforeEach, afterEach, setSystemTime } from 'bun:test';
import { StudioDashboardService } from './studio-dashboard.service';

function repo(rows: unknown[]) {
  return { find: mock(async () => rows) } as any;
}

describe('StudioDashboardService', () => {
  const now = new Date('2026-08-04T12:00:00Z');

  beforeEach(() => setSystemTime(now));
  afterEach(() => setSystemTime());

  test('YTD period returns both sections, cost folding in Section B spend', async () => {
    const projects = [
      { type: 'infrastructure_cloud', priority: 'P1', healthStatus: 'behind', startDate: null, targetDate: null },
    ];
    const tasks: unknown[] = [];
    const team: unknown[] = [];
    const expenses = [
      { amountCents: 43702, currency: 'USD', category: 'domains_saas', paidByEmail: 'a@nola.dev', date: '2026-03-01', status: 'paid' },
    ];
    const domains: unknown[] = [];
    const recurring: unknown[] = [];

    const svc = new StudioDashboardService(
      repo(projects),
      repo(tasks),
      repo(team),
      repo(expenses),
      repo(domains),
      repo(recurring),
      repo([]),
    );
    const result = await svc.get({ period: 'ytd' });

    expect(result.period).toEqual({ start: '2026-01-01', end: '2026-08-04', label: '2026-01-01 → 2026-08-04' });
    expect(result.sectionA.stats.projects).toBe(1);
    expect(result.sectionA.stats.cost).toBe(437.02);
    expect(result.sectionB.stats.spendInPeriodCents).toBe(43702);
  });

  test('no query defaults to the current calendar month', async () => {
    const svc = new StudioDashboardService(repo([]), repo([]), repo([]), repo([]), repo([]), repo([]), repo([]));
    const result = await svc.get();
    expect(result.period).toEqual({ start: '2026-08-01', end: '2026-08-31', label: '2026-08-01 → 2026-08-31' });
  });

  test('resolves a work item assignee id to an email via the team roster', async () => {
    const projects: unknown[] = [];
    const tasks = [
      { status: 'in_progress', priority: 'P1', assignee: 'tm1', dueDate: '2026-08-01', hoursSpent: '4.00' },
    ];
    const team = [{ id: 'tm1', email: 'a@nola.dev' }];

    const svc = new StudioDashboardService(
      repo(projects),
      repo(tasks),
      repo(team),
      repo([]),
      repo([]),
      repo([]),
      repo([]),
    );
    const result = await svc.get();

    expect(result.sectionA.donuts.tasksByAssignee).toEqual([{ key: 'a@nola.dev', count: 1 }]);
  });

  test('honours explicit period/year/month query params', async () => {
    const svc = new StudioDashboardService(repo([]), repo([]), repo([]), repo([]), repo([]), repo([]), repo([]));
    const result = await svc.get({ period: 'month', year: 2026, month: 2 });
    expect(result.period).toEqual({ start: '2026-02-01', end: '2026-02-28', label: '2026-02-01 → 2026-02-28' });
  });
});
