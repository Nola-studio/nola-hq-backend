import { annualizedAmount } from './studio.recurring';
import { inPeriod, monthOf, monthsInRange, type PeriodRange } from './studio.dashboard-period';

/**
 * Pure aggregation for the two-section, period-filtered Studio dashboard
 * that mirrors the "Project Management Dashboard" workbook. No Nest/DB
 * deps — `StudioDashboardService` feeds it plain rows; unit-tested
 * standalone (same split as `studio.board.ts` / `studio.dashboard-agg.ts`).
 *
 * A design decision worth flagging: `cost` in the Section A stat strip is
 * NOT just `sum(project.cost)`. The source workbook computes it as
 * `sum(project.cost) + spendInPeriod` (Section B's own total) — verified
 * against the real workbook, where every project's manual `cost` field is
 * empty and the "COST" KPI still shows the real infra/domain spend. Kept
 * faithful to that here rather than "fixing" what reads like a workbook
 * quirk, since it's the one number in the sheet actually backed by real
 * data.
 */

export interface DashboardProject {
  type: string | null;
  priority: string | null;
  healthStatus: string | null;
  budget: string | null;
  cost: string | null;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
}

export interface DashboardTask {
  status: string;
  priority: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  hoursSpent: string | null;
  /** Whether this task's project is archived — resolved by the caller from `WorkItem.projectId`. */
  projectArchived: boolean;
}

export interface DashboardExpense {
  amountCents: number;
  currency: string;
  category: string;
  paidByEmail: string;
  date: string;
  status: string | null;
}

export interface DashboardDomain {
  price: string | null;
  billingCycle: string | null;
}

export interface DashboardRecurring {
  service: string;
  amount: string;
  cycle: string;
}

export interface DonutSlice {
  key: string;
  count: number;
}

export interface MoneyDonutSlice {
  key: string;
  amountCents: number;
}

export interface MonthBudgetCost {
  month: number;
  budget: number;
  cost: number;
}

export interface MonthTaskActivity {
  month: number;
  completed: number;
  inProgress: number;
  pending: number;
}

export interface CurrencyTotal {
  currency: string;
  amountCents: number;
}

export interface SectionA {
  stats: {
    projects: number;
    budget: number;
    cost: number;
    budgetUtilizedPercent: number;
    tasks: number;
    tasksDone: number;
    hoursSpent: number;
    overdueProjects: number;
    overdueTasks: number;
  };
  donuts: {
    projectsByType: DonutSlice[];
    projectsByPriority: DonutSlice[];
    projectsByStatus: DonutSlice[];
    tasksByStatus: DonutSlice[];
    tasksByPriority: DonutSlice[];
    tasksByAssignee: DonutSlice[];
  };
  bars: {
    budgetVsCostByMonth: MonthBudgetCost[];
    taskActivityByMonth: MonthTaskActivity[];
  };
}

export interface SectionB {
  stats: {
    spendInPeriodCents: number;
    avgPerMonthCents: number;
    recurringPerMonthCents: number;
    recurringPerYearCents: number;
    domainCostPerYearCents: number;
    domainsOwned: number;
  };
  donuts: {
    spendByCategory: MoneyDonutSlice[];
    spendByPayer: MoneyDonutSlice[];
    recurringMonthlyMix: MoneyDonutSlice[];
  };
  /** Never folded into the USD figures above — rendered separately. */
  otherCurrencyTotals: CurrencyTotal[];
}

function sum(values: Array<string | null>): number {
  return values.reduce((total, v) => total + (v ? Number(v) : 0), 0);
}

function groupCount<T>(items: T[], keyFn: (item: T) => string): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
}

function groupSumCents<T>(items: T[], keyFn: (item: T) => string, amountFn: (item: T) => number): MoneyDonutSlice[] {
  const sums = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    sums.set(key, (sums.get(key) ?? 0) + amountFn(item));
  }
  return Array.from(sums.entries()).map(([key, amountCents]) => ({ key, amountCents }));
}

const TASK_ACTIVITY_BUCKET: Record<string, 'completed' | 'inProgress' | 'pending'> = {
  done: 'completed',
  in_progress: 'inProgress',
};

export function buildSectionA(
  projects: DashboardProject[],
  tasks: DashboardTask[],
  range: PeriodRange,
  today: string,
  includeArchived = false,
): SectionA {
  const visibleProjects = includeArchived ? projects : projects.filter((p) => !p.archived);
  const visibleTasks = includeArchived ? tasks : tasks.filter((t) => !t.projectArchived);

  const projectsInPeriod = visibleProjects.filter((p) => inPeriod(p.startDate, range));
  const tasksInPeriod = visibleTasks.filter((t) => inPeriod(t.dueDate, range));

  const budget = sum(projectsInPeriod.map((p) => p.budget));
  const spendInPeriodPlaceholder = 0; // filled in by the caller via `withCrossSectionCost`
  const cost = sum(projectsInPeriod.map((p) => p.cost)) + spendInPeriodPlaceholder;

  const budgetVsCostByMonth: MonthBudgetCost[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthProjects = projectsInPeriod.filter((p) => monthOf(p.startDate) === month);
    return { month, budget: sum(monthProjects.map((p) => p.budget)), cost: sum(monthProjects.map((p) => p.cost)) };
  });

  const taskActivityByMonth: MonthTaskActivity[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthTasks = tasksInPeriod.filter((t) => monthOf(t.dueDate) === month);
    const bucket = { completed: 0, inProgress: 0, pending: 0 };
    for (const t of monthTasks) bucket[TASK_ACTIVITY_BUCKET[t.status] ?? 'pending']++;
    return { month, ...bucket };
  });

  return {
    stats: {
      projects: projectsInPeriod.length,
      budget,
      cost,
      budgetUtilizedPercent: budget > 0 ? Math.round((cost / budget) * 100) : 0,
      tasks: tasksInPeriod.length,
      tasksDone: tasksInPeriod.filter((t) => t.status === 'done').length,
      hoursSpent: sum(tasksInPeriod.map((t) => t.hoursSpent)),
      // Overdue is always "as of today", independent of the period filter —
      // same semantics as the kanban board's own `isLate`.
      overdueProjects: visibleProjects.filter((p) => p.dueDate && p.dueDate < today && p.healthStatus !== 'completed').length,
      overdueTasks: visibleTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'done').length,
    },
    donuts: {
      projectsByType: groupCount(projectsInPeriod, (p) => p.type ?? 'unspecified'),
      projectsByPriority: groupCount(projectsInPeriod, (p) => p.priority ?? 'unspecified'),
      projectsByStatus: groupCount(projectsInPeriod, (p) => p.healthStatus ?? 'unspecified'),
      tasksByStatus: groupCount(tasksInPeriod, (t) => t.status),
      tasksByPriority: groupCount(tasksInPeriod, (t) => t.priority),
      tasksByAssignee: groupCount(tasksInPeriod, (t) => t.assigneeEmail ?? 'unassigned'),
    },
    bars: { budgetVsCostByMonth, taskActivityByMonth },
  };
}

export function buildSectionB(
  expenses: DashboardExpense[],
  domains: DashboardDomain[],
  recurring: DashboardRecurring[],
  range: PeriodRange,
): SectionB {
  const paid = expenses.filter((e) => e.status !== 'void');
  const usdInPeriod = paid.filter((e) => e.currency === 'USD' && inPeriod(e.date, range));
  const otherInPeriod = paid.filter((e) => e.currency !== 'USD' && inPeriod(e.date, range));

  const spendInPeriodCents = usdInPeriod.reduce((total, e) => total + e.amountCents, 0);
  const months = monthsInRange(range);
  const avgPerMonthCents = months > 0 ? Math.round(spendInPeriodCents / months) : 0;

  const recurringMonthlyCentsByService = recurring.map((r) => ({
    key: r.service,
    amountCents: Math.round((annualizedAmount(Number(r.amount), r.cycle) / 12) * 100),
  }));
  const recurringPerMonthCents = recurringMonthlyCentsByService.reduce((t, r) => t + r.amountCents, 0);
  const recurringPerYearCents = recurringPerMonthCents * 12;

  const domainCostPerYearCents = Math.round(
    sum(domains.map((d) => d.price)) * 100, // all current domains are Annual-cycle; see StudioDomain.billingCycle
  );

  const otherCurrencyMap = new Map<string, number>();
  for (const e of otherInPeriod) otherCurrencyMap.set(e.currency, (otherCurrencyMap.get(e.currency) ?? 0) + e.amountCents);

  return {
    stats: {
      spendInPeriodCents,
      avgPerMonthCents,
      recurringPerMonthCents,
      recurringPerYearCents,
      domainCostPerYearCents,
      domainsOwned: domains.length,
    },
    donuts: {
      spendByCategory: groupSumCents(usdInPeriod, (e) => e.category, (e) => e.amountCents),
      spendByPayer: groupSumCents(usdInPeriod, (e) => e.paidByEmail, (e) => e.amountCents),
      recurringMonthlyMix: recurringMonthlyCentsByService,
    },
    otherCurrencyTotals: Array.from(otherCurrencyMap.entries()).map(([currency, amountCents]) => ({ currency, amountCents })),
  };
}

/** Section A's `cost` KPI folds in Section B's spend — see file header. Applied after both sections are built. */
export function withCrossSectionCost(sectionA: SectionA, sectionB: SectionB): SectionA {
  const cost = sectionA.stats.cost + sectionB.stats.spendInPeriodCents / 100;
  const budget = sectionA.stats.budget;
  return {
    ...sectionA,
    stats: {
      ...sectionA.stats,
      cost,
      budgetUtilizedPercent: budget > 0 ? Math.round((cost / budget) * 100) : 0,
    },
  };
}
