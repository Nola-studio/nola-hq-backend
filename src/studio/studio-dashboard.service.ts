import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { StudioTask } from './studio-task.entity';
import { StudioExpense } from './studio-expense.entity';
import {
  tasksByStatus,
  openTasksByAssignee,
  countBlocked,
  countHighPriorityOpen,
  donePercent,
} from './studio.dashboard-agg';

/**
 * All the numbers `ScreenStudio`'s Dashboard tab needs, in one round trip.
 * `date`/`dueDate` columns are plain `YYYY-MM-DD` strings (TypeORM `date`
 * type), so every bucketing below is lexicographic string comparison —
 * no timezone parsing, unlike a `Date`-typed column.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
}

function quarterStartStr(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return `${d.getUTCFullYear()}-${pad2(q + 1)}-01`;
}

function monthsAgoStartStr(n: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return monthStartStr(d);
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface StudioDashboard {
  kpis: {
    tasksInProgress: number;
    tasksLate: number;
    tasksBlocked: number;
    tasksHighPriorityOpen: number;
    tasksDonePercent: number;
    expensesThisMonth: { currency: string; amountCents: number }[];
    nextDue: { identifier: string; title: string; dueDate: string } | null;
  };
  expensesByCategoryCurrentQuarter: { category: string; currency: string; amountCents: number }[];
  expensesMonthly: { month: string; currency: string; amountCents: number }[];
  tasksByAssigneeStatus: { assigneeEmail: string | null; status: string; count: number }[];
  tasksByStatus: { status: string; count: number }[];
  tasksOpenByAssignee: { assigneeEmail: string | null; count: number }[];
  upcomingDeadlines: {
    id: string;
    identifier: string;
    title: string;
    assigneeEmail: string | null;
    dueDate: string;
    late: boolean;
  }[];
  activityHeatmap: { date: string; count: number }[];
}

@Injectable()
export class StudioDashboardService {
  constructor(
    @InjectRepository(StudioTask)
    private readonly tasks: Repository<StudioTask>,
    @InjectRepository(StudioExpense)
    private readonly expenses: Repository<StudioExpense>,
  ) {}

  async get(): Promise<StudioDashboard> {
    const now = new Date();
    const today = todayStr();
    const monthStart = monthStartStr(now);
    const quarterStart = quarterStartStr(now);
    const sixMonthsAgoStart = monthsAgoStartStr(5);
    const eightWeeksAgo = new Date(now.getTime() - 55 * 86_400_000);
    const in14Days = addDaysStr(today, 14);

    const [allTasks, expensesThisMonth, expensesLast6Months, completedTasks] = await Promise.all([
      this.tasks.find(),
      this.expenses.find({ where: { date: MoreThanOrEqual(monthStart) } }),
      this.expenses.find({ where: { date: MoreThanOrEqual(sixMonthsAgoStart) } }),
      this.tasks.find({ where: { completedAt: MoreThanOrEqual(eightWeeksAgo) } }),
    ]);

    // ── KPIs ───────────────────────────────────────────────────
    const tasksInProgress = allTasks.filter((t) => t.status === 'in_progress').length;
    const lateTasks = allTasks.filter((t) => t.dueDate && t.status !== 'done' && t.dueDate < today);
    const tasksLate = lateTasks.length;

    const expensesThisMonthByCurrency = new Map<string, number>();
    for (const e of expensesThisMonth) {
      expensesThisMonthByCurrency.set(e.currency, (expensesThisMonthByCurrency.get(e.currency) ?? 0) + e.amountCents);
    }

    const upcomingSorted = allTasks
      .filter((t) => t.dueDate && t.status !== 'done' && t.dueDate >= today)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const nextDue = upcomingSorted[0]
      ? { identifier: upcomingSorted[0].identifier, title: upcomingSorted[0].title, dueDate: upcomingSorted[0].dueDate! }
      : null;

    // ── Expenses by category (current quarter), per currency ────
    const byCategoryQuarter = new Map<string, number>();
    for (const e of expensesLast6Months) {
      if (e.date < quarterStart) continue;
      const key = `${e.category}::${e.currency}`;
      byCategoryQuarter.set(key, (byCategoryQuarter.get(key) ?? 0) + e.amountCents);
    }
    const expensesByCategoryCurrentQuarter = Array.from(byCategoryQuarter.entries()).map(([key, amountCents]) => {
      const [category, currency] = key.split('::');
      return { category, currency, amountCents };
    });

    // ── Expenses monthly (last 6 months), per currency ──────────
    const byMonth = new Map<string, number>();
    for (const e of expensesLast6Months) {
      const key = `${e.date.slice(0, 7)}::${e.currency}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + e.amountCents);
    }
    const expensesMonthly = Array.from(byMonth.entries())
      .map(([key, amountCents]) => {
        const [month, currency] = key.split('::');
        return { month, currency, amountCents };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    // ── Tasks by status / open workload by assignee ──────────────
    const tasksByStatusResult = tasksByStatus(allTasks);
    const tasksOpenByAssignee = openTasksByAssignee(allTasks);

    // ── Tasks by assignee × status ───────────────────────────────
    const byAssigneeStatus = new Map<string, number>();
    for (const t of allTasks) {
      const key = `${t.assigneeEmail ?? 'unassigned'}::${t.status}`;
      byAssigneeStatus.set(key, (byAssigneeStatus.get(key) ?? 0) + 1);
    }
    const tasksByAssigneeStatus = Array.from(byAssigneeStatus.entries()).map(([key, count]) => {
      const [assigneeEmail, status] = key.split('::');
      return { assigneeEmail: assigneeEmail === 'unassigned' ? null : assigneeEmail, status, count };
    });

    // ── Upcoming deadlines (next 14 days) ────────────────────────
    const upcomingDeadlines = allTasks
      .filter((t) => t.dueDate && t.status !== 'done' && t.dueDate <= in14Days)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .map((t) => ({
        id: t.id,
        identifier: t.identifier,
        title: t.title,
        assigneeEmail: t.assigneeEmail,
        dueDate: t.dueDate!,
        late: t.dueDate! < today,
      }));

    // ── Activity heatmap (completed tasks, last 8 weeks) ─────────
    const byDay = new Map<string, number>();
    for (const t of completedTasks) {
      if (!t.completedAt) continue;
      const key = t.completedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const activityHeatmap = Array.from(byDay.entries()).map(([date, count]) => ({ date, count }));

    return {
      kpis: {
        tasksInProgress,
        tasksLate,
        tasksBlocked: countBlocked(allTasks),
        tasksHighPriorityOpen: countHighPriorityOpen(allTasks),
        tasksDonePercent: donePercent(allTasks),
        expensesThisMonth: Array.from(expensesThisMonthByCurrency.entries()).map(([currency, amountCents]) => ({
          currency,
          amountCents,
        })),
        nextDue,
      },
      expensesByCategoryCurrentQuarter,
      expensesMonthly,
      tasksByAssigneeStatus,
      tasksByStatus: tasksByStatusResult,
      tasksOpenByAssignee,
      upcomingDeadlines,
      activityHeatmap,
    };
  }
}
