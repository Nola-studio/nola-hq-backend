import { test, expect, describe } from 'bun:test';
import {
  buildSectionA,
  buildSectionB,
  withCrossSectionCost,
  type DashboardProject,
  type DashboardInitiative,
  type DashboardTask,
  type DashboardExpense,
  type DashboardDomain,
  type DashboardRecurring,
} from './studio.dashboard-workbook';
import type { PeriodRange } from './studio.dashboard-period';

const RANGE: PeriodRange = { start: '2026-01-01', end: '2026-08-04', label: '2026-01-01 → 2026-08-04' };
const TODAY = '2026-08-04';

function project(over: Partial<DashboardProject> = {}): DashboardProject {
  return {
    type: 'web_app_development',
    priority: null,
    healthStatus: null,
    startDate: null,
    dueDate: null,
    archived: false,
    ...over,
  };
}

function task(over: Partial<DashboardTask> = {}): DashboardTask {
  return {
    status: 'backlog',
    priority: 'none',
    assigneeEmail: null,
    dueDate: null,
    hoursSpent: null,
    projectArchived: false,
    ...over,
  };
}

function initiative(over: Partial<DashboardInitiative> = {}): DashboardInitiative {
  return {
    type: 'web_app_development',
    priority: null,
    healthStatus: null,
    startDate: null,
    dueDate: null,
    archived: false,
    ...over,
  };
}

describe('buildSectionA', () => {
  test('reproduces the real workbook snapshot: 5 projects, 0 tasks', () => {
    const projects: DashboardProject[] = [
      project({ type: 'infrastructure_cloud', priority: 'high', healthStatus: 'behind' }),
      project({ type: 'web_app_development' }),
      project({ type: 'web_app_development' }),
      project({ type: 'web_app_development' }),
      project({ type: 'web_app_development' }),
    ];
    const result = buildSectionA(projects, [], [], [], RANGE, TODAY);
    expect(result.stats.projects).toBe(5);
    expect(result.stats.cost).toBe(0); // cross-section cost added separately
    expect(result.stats.tasks).toBe(0);
    expect(result.donuts.projectsByType).toEqual(
      expect.arrayContaining([
        { key: 'infrastructure_cloud', count: 1 },
        { key: 'web_app_development', count: 4 },
      ]),
    );
  });

  test('a project with no startDate is always in period (workbook "In Period?" rule)', () => {
    const result = buildSectionA([project({ startDate: null })], [], [], [], RANGE, TODAY);
    expect(result.stats.projects).toBe(1);
  });

  test('a project with a startDate outside the period is excluded', () => {
    const result = buildSectionA([project({ startDate: '2025-01-01' })], [], [], [], RANGE, TODAY);
    expect(result.stats.projects).toBe(0);
  });

  test('overdue projects/tasks ignore the period filter — always "as of today"', () => {
    const projects = [project({ dueDate: '2026-01-01', healthStatus: 'behind', startDate: '2020-01-01' })];
    const tasks = [task({ dueDate: '2026-01-01', status: 'in_progress', hoursSpent: null })];
    const result = buildSectionA(projects, [], tasks, [], RANGE, TODAY);
    expect(result.stats.overdueProjects).toBe(1);
    expect(result.stats.overdueTasks).toBe(1);
  });

  test('a completed project past its due date does not count as overdue', () => {
    const projects = [project({ dueDate: '2026-01-01', healthStatus: 'completed' })];
    expect(buildSectionA(projects, [], [], [], RANGE, TODAY).stats.overdueProjects).toBe(0);
  });

  test('hoursSpent sums only in-period tasks', () => {
    const tasks = [
      task({ dueDate: '2026-05-01', hoursSpent: '4.5' }),
      task({ dueDate: '2025-01-01', hoursSpent: '10' }), // outside range
      task({ dueDate: null, hoursSpent: '2' }), // no date -> in period
    ];
    expect(buildSectionA([], [], tasks, [], RANGE, TODAY).stats.hoursSpent).toBe(6.5);
  });

  test('taskActivityByMonth buckets done/in_progress/everything-else', () => {
    const tasks = [
      task({ dueDate: '2026-03-15', status: 'done' }),
      task({ dueDate: '2026-03-20', status: 'in_progress' }),
      task({ dueDate: '2026-03-25', status: 'blocked' }),
    ];
    const result = buildSectionA([], [], tasks, [], RANGE, TODAY);
    const march = result.bars.taskActivityByMonth.find((m) => m.month === 3)!;
    expect(march).toEqual({ month: 3, completed: 1, inProgress: 1, pending: 1 });
  });

  test('archived projects are excluded by default, along with their tasks', () => {
    const projects = [
      project({ archived: false, healthStatus: 'behind', dueDate: '2026-01-01' }),
      project({ archived: true, healthStatus: 'behind', dueDate: '2026-01-01' }),
    ];
    const tasks = [
      task({ projectArchived: false, status: 'in_progress', hoursSpent: '2', dueDate: '2026-01-01' }),
      task({ projectArchived: true, status: 'in_progress', hoursSpent: '20', dueDate: '2026-01-01' }),
    ];
    const result = buildSectionA(projects, [], tasks, [], RANGE, TODAY);
    expect(result.stats.projects).toBe(1);
    expect(result.stats.tasks).toBe(1);
    expect(result.stats.hoursSpent).toBe(2);
    expect(result.stats.overdueProjects).toBe(1);
    expect(result.stats.overdueTasks).toBe(1);
  });

  test('includeArchived=true folds archived projects and their tasks back in', () => {
    const projects = [
      project({ archived: false }),
      project({ archived: true }),
    ];
    const tasks = [
      task({ projectArchived: false, hoursSpent: '2' }),
      task({ projectArchived: true, hoursSpent: '20' }),
    ];
    const result = buildSectionA(projects, [], tasks, [], RANGE, TODAY, true);
    expect(result.stats.projects).toBe(2);
    expect(result.stats.tasks).toBe(2);
    expect(result.stats.hoursSpent).toBe(22);
  });

  test('initiatives are counted and donut-grouped separately from projects', () => {
    const projects = [project({ type: 'website' })];
    const initiatives = [
      initiative({ type: 'infrastructure_cloud', priority: 'high' }),
      initiative({ type: 'web_app_development' }),
    ];
    const result = buildSectionA(projects, initiatives, [], [], RANGE, TODAY);
    expect(result.stats.projects).toBe(1);
    expect(result.stats.initiatives).toBe(2);
    expect(result.donuts.initiativesByType).toEqual(
      expect.arrayContaining([
        { key: 'infrastructure_cloud', count: 1 },
        { key: 'web_app_development', count: 1 },
      ]),
    );
    // The projects donut must not pick up the initiative's type.
    expect(result.donuts.projectsByType).toEqual([{ key: 'website', count: 1 }]);
  });

  test('overdueInitiatives ignores the period filter, like overdueProjects', () => {
    const initiatives = [
      initiative({ dueDate: '2026-01-01', healthStatus: 'behind', startDate: '2020-01-01' }),
    ];
    const result = buildSectionA([], initiatives, [], [], RANGE, TODAY);
    expect(result.stats.overdueInitiatives).toBe(1);
  });

  test('an archived initiative is excluded by default, folded back in with includeArchived', () => {
    const initiatives = [
      initiative({ archived: false, type: 'website' }),
      initiative({ archived: true, type: 'other' }),
    ];
    expect(buildSectionA([], initiatives, [], [], RANGE, TODAY).stats.initiatives).toBe(1);
    expect(buildSectionA([], initiatives, [], [], RANGE, TODAY, true).stats.initiatives).toBe(2);
  });
});

describe('buildSectionB', () => {
  function expense(over: Partial<DashboardExpense> = {}): DashboardExpense {
    return { amountCents: 1000, currency: 'USD', category: 'domains_saas', paidByEmail: 'a@nola.dev', date: '2026-03-01', status: 'paid', ...over };
  }

  test('reproduces the real workbook total: 341.02 billed + separate recurring', () => {
    const expenses: DashboardExpense[] = [
      expense({ amountCents: 1100, date: '2026-08-01' }),
      expense({ amountCents: 0, date: '2026-08-01', status: 'void' }),
      expense({ amountCents: 2000, date: '2026-07-28' }),
    ];
    const result = buildSectionB(expenses, [], [], RANGE);
    expect(result.stats.spendInPeriodCents).toBe(3100);
  });

  test('void expenses are excluded entirely', () => {
    const expenses = [expense({ amountCents: 5000, status: 'void' })];
    expect(buildSectionB(expenses, [], [], RANGE).stats.spendInPeriodCents).toBe(0);
  });

  test('non-USD expenses never fold into spendInPeriodCents, surface separately', () => {
    const expenses = [expense({ amountCents: 1000, currency: 'USD' }), expense({ amountCents: 2000, currency: 'CAD' })];
    const result = buildSectionB(expenses, [], [], RANGE);
    expect(result.stats.spendInPeriodCents).toBe(1000);
    expect(result.otherCurrencyTotals).toEqual([{ currency: 'CAD', amountCents: 2000 }]);
  });

  test('avgPerMonthCents divides by the number of months in range', () => {
    const expenses = [expense({ amountCents: 8000, date: '2026-01-15' })];
    // RANGE spans Jan..Aug = 8 months
    expect(buildSectionB(expenses, [], [], RANGE).stats.avgPerMonthCents).toBe(1000);
  });

  test('recurring totals: monthly cycle summed as-is, annual cycle divided by 12', () => {
    const recurring: DashboardRecurring[] = [
      { service: 'ProtonMail', amount: '12', cycle: 'Monthly' },
      { service: 'Domain reg', amount: '120', cycle: 'Annual' },
    ];
    const result = buildSectionB([], [], recurring, RANGE);
    // 12/mo + (120/12)/mo = 22/mo
    expect(result.stats.recurringPerMonthCents).toBe(2200);
    expect(result.stats.recurringPerYearCents).toBe(26400);
  });

  test('domainCostPerYearCents sums current domain prices, independent of period', () => {
    const domains: DashboardDomain[] = [{ price: '18', billingCycle: 'Annual' }, { price: '14', billingCycle: 'Annual' }];
    expect(buildSectionB([], domains, [], RANGE).stats.domainCostPerYearCents).toBe(3200);
    expect(buildSectionB([], domains, [], RANGE).stats.domainsOwned).toBe(2);
  });

  test('spendByCategory and spendByPayer group only in-period, paid, USD expenses', () => {
    const expenses = [
      expense({ category: 'domains_saas', paidByEmail: 'a@nola.dev', amountCents: 1000 }),
      expense({ category: 'domains_saas', paidByEmail: 'b@nola.dev', amountCents: 500 }),
      expense({ category: 'infra_hosting', paidByEmail: 'a@nola.dev', amountCents: 2000 }),
    ];
    const result = buildSectionB(expenses, [], [], RANGE);
    expect(result.donuts.spendByCategory).toEqual(
      expect.arrayContaining([
        { key: 'domains_saas', amountCents: 1500 },
        { key: 'infra_hosting', amountCents: 2000 },
      ]),
    );
    expect(result.donuts.spendByPayer).toEqual(
      expect.arrayContaining([
        { key: 'a@nola.dev', amountCents: 3000 },
        { key: 'b@nola.dev', amountCents: 500 },
      ]),
    );
  });

  describe('monthlyBreakdown', () => {
    const recurring: DashboardRecurring[] = [{ service: 'ProtonMail', amount: '12', cycle: 'Monthly' }];

    test('one row per month in range, even with no expenses at all', () => {
      const result = buildSectionB([], [], recurring, RANGE); // RANGE spans Jan..Aug = 8 months
      expect(result.monthlyBreakdown).toHaveLength(8);
      expect(result.monthlyBreakdown.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    test('buckets infra_hosting into subscriptionsCents and domains_saas into domainsCents, by month', () => {
      const expenses = [
        expense({ category: 'infra_hosting', amountCents: 2000, date: '2026-03-05' }),
        expense({ category: 'domains_saas', amountCents: 500, date: '2026-03-20' }),
        expense({ category: 'infra_hosting', amountCents: 3000, date: '2026-04-01' }),
      ];
      const result = buildSectionB(expenses, [], recurring, RANGE);
      const march = result.monthlyBreakdown.find((r) => r.month === 3)!;
      const april = result.monthlyBreakdown.find((r) => r.month === 4)!;
      expect(march.subscriptionsCents).toBe(2000);
      expect(march.domainsCents).toBe(500);
      expect(april.subscriptionsCents).toBe(3000);
      expect(april.domainsCents).toBe(0);
    });

    test('protonMailCents is the flat monthly recurring amount, identical every month, even with zero expenses', () => {
      const result = buildSectionB([], [], recurring, RANGE);
      expect(result.monthlyBreakdown.every((r) => r.protonMailCents === 1200)).toBe(true);
    });

    test('protonMailCents is 0 when no ProtonMail recurring row exists', () => {
      const result = buildSectionB([], [], [{ service: 'Railway', amount: '20', cycle: 'Monthly' }], RANGE);
      expect(result.monthlyBreakdown.every((r) => r.protonMailCents === 0)).toBe(true);
    });

    test('matches by service name case-insensitively', () => {
      const result = buildSectionB([], [], [{ service: 'protonmail', amount: '12', cycle: 'Monthly' }], RANGE);
      expect(result.monthlyBreakdown[0].protonMailCents).toBe(1200);
    });

    test('totalCents is subscriptions + domains + protonMail, not the actual billed total', () => {
      const expenses = [expense({ category: 'infra_hosting', amountCents: 2000, date: '2026-03-05' })];
      const result = buildSectionB(expenses, [], recurring, RANGE);
      const march = result.monthlyBreakdown.find((r) => r.month === 3)!;
      expect(march.totalCents).toBe(2000 + 0 + 1200);
    });

    test('void and non-USD expenses never reach the monthly breakdown', () => {
      const expenses = [
        expense({ category: 'infra_hosting', amountCents: 5000, date: '2026-03-05', status: 'void' }),
        expense({ category: 'infra_hosting', amountCents: 5000, date: '2026-03-05', currency: 'CAD' }),
      ];
      const result = buildSectionB(expenses, [], recurring, RANGE);
      const march = result.monthlyBreakdown.find((r) => r.month === 3)!;
      expect(march.subscriptionsCents).toBe(0);
    });
  });
});

describe('withCrossSectionCost', () => {
  test('Section A cost is entirely Section B spend, per the workbook formula', () => {
    const sectionA = buildSectionA([project()], [], [], [], RANGE, TODAY);
    const sectionB = buildSectionB(
      [{ amountCents: 43702, currency: 'USD', category: 'domains_saas', paidByEmail: 'a@nola.dev', date: '2026-03-01', status: 'paid' }],
      [],
      [],
      RANGE,
    );
    const merged = withCrossSectionCost(sectionA, sectionB);
    expect(merged.stats.cost).toBe(437.02);
  });
});
