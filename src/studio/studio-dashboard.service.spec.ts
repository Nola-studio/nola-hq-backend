import { test, expect, describe, mock, beforeEach, afterEach, setSystemTime } from 'bun:test';
import { StudioDashboardService } from './studio-dashboard.service';

describe('StudioDashboardService', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  beforeEach(() => setSystemTime(now));
  afterEach(() => setSystemTime());

  test('computes KPIs, groupings and the activity heatmap from a single aggregate call', async () => {
    const tasks = [
      { id: 't1', identifier: 'YEK-1', title: 'A', status: 'in_progress', priority: 'high', assigneeEmail: 'a@nola.dev', dueDate: '2026-08-20', completedAt: null },
      { id: 't2', identifier: 'YEK-2', title: 'B', status: 'in_review', priority: 'none', assigneeEmail: 'a@nola.dev', dueDate: '2026-08-01', completedAt: null },
      { id: 't3', identifier: 'YEK-3', title: 'C', status: 'done', priority: 'none', assigneeEmail: null, dueDate: '2026-08-10', completedAt: new Date('2026-08-14T00:00:00Z') },
      { id: 't4', identifier: 'YEK-4', title: 'D', status: 'blocked', priority: 'none', assigneeEmail: 'a@nola.dev', dueDate: null, completedAt: null },
      { id: 't5', identifier: 'YEK-5', title: 'E', status: 'backlog', priority: 'urgent', assigneeEmail: null, dueDate: null, completedAt: null },
    ];
    const expenses = [
      { category: 'infra_hosting', currency: 'CAD', amountCents: 5000, date: '2026-08-05' },
      { category: 'infra_hosting', currency: 'CAD', amountCents: 3000, date: '2026-07-01' },
      { category: 'marketing', currency: 'USD', amountCents: 2000, date: '2026-08-10' },
    ];

    const tasksRepo = {
      find: mock(async (opts?: any) => {
        if (opts?.where?.completedAt) return tasks.filter((t) => t.completedAt);
        return tasks;
      }),
    } as any;
    // `Promise.all` invokes both `expenses.find` calls synchronously before
    // awaiting, so call order matches the service's declaration order:
    // [0] = expensesThisMonth (>= start of this month), [1] = last 6 months.
    let expensesCall = 0;
    const expensesRepo = {
      find: mock(async () => {
        const gte = expensesCall === 0 ? '2026-08-01' : '2026-03-01';
        expensesCall += 1;
        return expenses.filter((e) => e.date >= gte);
      }),
    } as any;

    const svc = new StudioDashboardService(tasksRepo, expensesRepo);
    const result = await svc.get();

    expect(result.kpis.tasksInProgress).toBe(1);
    expect(result.kpis.tasksLate).toBe(1); // t2, due 2026-08-01, not done
    expect(result.kpis.tasksBlocked).toBe(1); // t4
    expect(result.kpis.tasksHighPriorityOpen).toBe(2); // t1 (high) + t5 (urgent)
    expect(result.kpis.tasksDonePercent).toBe(20); // 1 of 5
    expect(result.kpis.expensesThisMonth).toEqual([
      { currency: 'CAD', amountCents: 5000 },
      { currency: 'USD', amountCents: 2000 },
    ]);
    expect(result.kpis.nextDue).toEqual({ identifier: 'YEK-1', title: 'A', dueDate: '2026-08-20' });

    expect(result.tasksByAssigneeStatus).toEqual(
      expect.arrayContaining([
        { assigneeEmail: 'a@nola.dev', status: 'in_progress', count: 1 },
        { assigneeEmail: 'a@nola.dev', status: 'in_review', count: 1 },
        { assigneeEmail: null, status: 'done', count: 1 },
      ]),
    );

    expect(result.tasksByStatus).toEqual([
      { status: 'backlog', count: 1 },
      { status: 'this_quarter', count: 0 },
      { status: 'in_progress', count: 1 },
      { status: 'blocked', count: 1 },
      { status: 'in_review', count: 1 },
      { status: 'done', count: 1 },
    ]);

    expect(result.tasksOpenByAssignee).toEqual(
      expect.arrayContaining([
        { assigneeEmail: 'a@nola.dev', count: 3 },
        { assigneeEmail: null, count: 1 },
      ]),
    );

    expect(result.activityHeatmap).toEqual([{ date: '2026-08-14', count: 1 }]);
  });
});
