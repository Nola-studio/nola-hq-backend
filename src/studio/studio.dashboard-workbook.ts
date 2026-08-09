import { annualizedAmount } from './studio.recurring';
import { inPeriod, monthOf, monthNumbersInRange, monthsInRange, type PeriodRange } from './studio.dashboard-period';

function isSameMonth(dateStr: string, todayYearMonth: string): boolean {
  return dateStr.slice(0, 7) === todayYearMonth;
}

/**
 * Pure aggregation for the two-section, period-filtered Studio dashboard
 * that mirrors the "Project Management Dashboard" workbook. No Nest/DB
 * deps — `StudioDashboardService` feeds it plain rows; unit-tested
 * standalone (same split as `studio.board.ts` / `studio.dashboard-agg.ts`).
 *
 * `cost` in the Section A stat strip is Section B's own spend
 * (`spendInPeriodCents`, folded in by `withCrossSectionCost`) — there is no
 * separate per-project cost figure anymore. `RoadmapInitiative.budget`/
 * `.cost` (USD) were dropped once `ProjectBudget` (Business module, CDF,
 * wired into invoices/expenses/margin) became the single source of truth
 * for project financials; `budget`/`budgetUtilizedPercent` and the
 * "Budget vs coût par mois" bar chart went with them — Section B's own
 * Dépenses breakdown already covers this spend.
 *
 * The monthly breakdown's "ProtonMail" column (`MonthlyBreakdownRow`)
 * is not a billed expense at all — production has zero expense rows
 * describing it, only a $12/mo row in `studio_recurring`. The workbook's own
 * cell is a formula reference into the Recurring sheet, not a Billing-sheet
 * sum — so this column is a flat constant repeated for every month, not an
 * aggregate.
 */

export interface DashboardProject {
  type: string | null;
  priority: string | null;
  healthStatus: string | null;
  startDate: string | null;
  dueDate: string | null;
  archived: boolean;
}

/** Same shape as `DashboardProject`. See `SectionA.stats.initiatives`/`.initiativesByType` etc. */
export interface DashboardInitiative {
  type: string | null;
  priority: string | null;
  healthStatus: string | null;
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

export interface DashboardRequest {
  type: string;
  status: string;
}

export interface DonutSlice {
  key: string;
  count: number;
}

export interface MoneyDonutSlice {
  key: string;
  amountCents: number;
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

/**
 * One row of the workbook's M:Q monthly pivot. `subscriptionsCents`
 * ("Abonnements") and `domainsCents` ("Domaines") are billed expenses for
 * that month, grouped by category (`infra_hosting`/`domains_saas`).
 * `protonMailCents` is NOT billed per-invoice — it's the flat recurring
 * subscription amount (`StudioRecurring` row, `=Recurring!$C$2` in the
 * source sheet), the same value every month in range. `totalCents` is the
 * sum of the three, not the actual billed total for the month (ProtonMail
 * never appears as its own expense row — see the class doc comment).
 */
export interface MonthlyBreakdownRow {
  month: number;
  subscriptionsCents: number;
  domainsCents: number;
  protonMailCents: number;
  totalCents: number;
}

export interface SectionA {
  stats: {
    projects: number;
    cost: number;
    tasks: number;
    tasksDone: number;
    hoursSpent: number;
    overdueProjects: number;
    overdueTasks: number;
    requestsOpen: number;
    initiatives: number;
    overdueInitiatives: number;
  };
  donuts: {
    projectsByType: DonutSlice[];
    projectsByPriority: DonutSlice[];
    projectsByStatus: DonutSlice[];
    tasksByStatus: DonutSlice[];
    tasksByPriority: DonutSlice[];
    tasksByAssignee: DonutSlice[];
    requestsByType: DonutSlice[];
    initiativesByType: DonutSlice[];
    initiativesByPriority: DonutSlice[];
    initiativesByStatus: DonutSlice[];
  };
  bars: {
    taskActivityByMonth: MonthTaskActivity[];
  };
}

export interface SectionB {
  stats: {
    spendInPeriodCents: number;
    /** Current calendar month's USD spend — independent of the selected period filter, for the dashboard's "Dépenses ce mois" stat. */
    spendThisMonthCents: number;
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
  /** The workbook's M:Q pivot — one row per month touched by `range`. */
  monthlyBreakdown: MonthlyBreakdownRow[];
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

/** Not yet at a terminal state — mirrors `StudioRequest`'s own lifecycle, independent of the period filter. */
const OPEN_REQUEST_STATUSES = new Set(['nouvelle', 'en_revue', 'acceptee']);

export function buildSectionA(
  projects: DashboardProject[],
  initiatives: DashboardInitiative[],
  tasks: DashboardTask[],
  requests: DashboardRequest[],
  range: PeriodRange,
  today: string,
  includeArchived = false,
): SectionA {
  const visibleProjects = includeArchived ? projects : projects.filter((p) => !p.archived);
  const visibleInitiatives = includeArchived ? initiatives : initiatives.filter((i) => !i.archived);
  const visibleTasks = includeArchived ? tasks : tasks.filter((t) => !t.projectArchived);

  const projectsInPeriod = visibleProjects.filter((p) => inPeriod(p.startDate, range));
  const initiativesInPeriod = visibleInitiatives.filter((i) => inPeriod(i.startDate, range));
  const tasksInPeriod = visibleTasks.filter((t) => inPeriod(t.dueDate, range));

  const cost = 0; // filled in by the caller via `withCrossSectionCost` — Section B's spend, nothing else

  const taskActivityByMonth: MonthTaskActivity[] = monthNumbersInRange(range).map((month) => {
    const monthTasks = tasksInPeriod.filter((t) => monthOf(t.dueDate) === month);
    const bucket = { completed: 0, inProgress: 0, pending: 0 };
    for (const t of monthTasks) bucket[TASK_ACTIVITY_BUCKET[t.status] ?? 'pending']++;
    return { month, ...bucket };
  });

  return {
    stats: {
      projects: projectsInPeriod.length,
      cost,
      tasks: tasksInPeriod.length,
      tasksDone: tasksInPeriod.filter((t) => t.status === 'done').length,
      hoursSpent: sum(tasksInPeriod.map((t) => t.hoursSpent)),
      // Overdue is always "as of today", independent of the period filter —
      // same semantics as the kanban board's own `isLate`.
      overdueProjects: visibleProjects.filter((p) => p.dueDate && p.dueDate < today && p.healthStatus !== 'completed').length,
      overdueTasks: visibleTasks.filter((t) => t.dueDate && t.dueDate < today && t.status !== 'done').length,
      // As-of-today, like the overdue counts above — not period-filtered.
      requestsOpen: requests.filter((r) => OPEN_REQUEST_STATUSES.has(r.status)).length,
      initiatives: initiativesInPeriod.length,
      overdueInitiatives: visibleInitiatives.filter((i) => i.dueDate && i.dueDate < today && i.healthStatus !== 'completed').length,
    },
    donuts: {
      projectsByType: groupCount(projectsInPeriod, (p) => p.type ?? 'unspecified'),
      projectsByPriority: groupCount(projectsInPeriod, (p) => p.priority ?? 'unspecified'),
      projectsByStatus: groupCount(projectsInPeriod, (p) => p.healthStatus ?? 'unspecified'),
      tasksByStatus: groupCount(tasksInPeriod, (t) => t.status),
      tasksByPriority: groupCount(tasksInPeriod, (t) => t.priority),
      tasksByAssignee: groupCount(tasksInPeriod, (t) => t.assigneeEmail ?? 'unassigned'),
      requestsByType: groupCount(
        requests.filter((r) => OPEN_REQUEST_STATUSES.has(r.status)),
        (r) => r.type,
      ),
      initiativesByType: groupCount(initiativesInPeriod, (i) => i.type ?? 'unspecified'),
      initiativesByPriority: groupCount(initiativesInPeriod, (i) => i.priority ?? 'unspecified'),
      initiativesByStatus: groupCount(initiativesInPeriod, (i) => i.healthStatus ?? 'unspecified'),
    },
    bars: { taskActivityByMonth },
  };
}

export function buildSectionB(
  expenses: DashboardExpense[],
  domains: DashboardDomain[],
  recurring: DashboardRecurring[],
  range: PeriodRange,
  today: string,
): SectionB {
  const paid = expenses.filter((e) => e.status !== 'void');
  const usdInPeriod = paid.filter((e) => e.currency === 'USD' && inPeriod(e.date, range));
  const otherInPeriod = paid.filter((e) => e.currency !== 'USD' && inPeriod(e.date, range));

  const spendInPeriodCents = usdInPeriod.reduce((total, e) => total + e.amountCents, 0);
  const todayYearMonth = today.slice(0, 7);
  const spendThisMonthCents = paid
    .filter((e) => e.currency === 'USD' && isSameMonth(e.date, todayYearMonth))
    .reduce((total, e) => total + e.amountCents, 0);
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

  const protonMail = recurring.find((r) => r.service.trim().toLowerCase() === 'protonmail');
  const protonMailMonthlyCents = protonMail
    ? Math.round((annualizedAmount(Number(protonMail.amount), protonMail.cycle) / 12) * 100)
    : 0;

  const monthlyBreakdown: MonthlyBreakdownRow[] = monthNumbersInRange(range).map((month) => {
    const monthExpenses = usdInPeriod.filter((e) => monthOf(e.date) === month);
    const subscriptionsCents = monthExpenses
      .filter((e) => e.category === 'infra_hosting')
      .reduce((t, e) => t + e.amountCents, 0);
    const domainsCents = monthExpenses
      .filter((e) => e.category === 'domains_saas')
      .reduce((t, e) => t + e.amountCents, 0);
    return {
      month,
      subscriptionsCents,
      domainsCents,
      protonMailCents: protonMailMonthlyCents,
      totalCents: subscriptionsCents + domainsCents + protonMailMonthlyCents,
    };
  });

  return {
    stats: {
      spendInPeriodCents,
      spendThisMonthCents,
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
    monthlyBreakdown,
  };
}

/** Section A's `cost` KPI is entirely Section B's spend — see file header. Applied after both sections are built. */
export function withCrossSectionCost(sectionA: SectionA, sectionB: SectionB): SectionA {
  return {
    ...sectionA,
    stats: {
      ...sectionA.stats,
      cost: sectionA.stats.cost + sectionB.stats.spendInPeriodCents / 100,
    },
  };
}
