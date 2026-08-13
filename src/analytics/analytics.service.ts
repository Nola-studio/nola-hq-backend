import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThanOrEqual, LessThanOrEqual, Repository } from 'typeorm';
import type { FindOptionsWhere, FindOperator } from 'typeorm';
import { Kpi } from './kpi.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { AppsService } from '../apps/apps.service';
import { TenantsService, type TenantView } from '../tenants/tenants.service';
import { InvoicesService } from '../invoices/invoices.service';
import { HealthService } from '../health/health.service';
import { SnapshotsService } from './snapshots.service';
import { buildKpiList } from './snapshot.metrics';

/** `?from=&to=` analytics window (ISO-8601 strings; both optional). */
export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Build a TypeORM `createdAt` filter for an inclusive `[from, to]` window,
 * or `undefined` when neither bound is usable.
 */
function createdAtFilter(range: DateRange | undefined): FindOperator<Date> | undefined {
  if (!range) return undefined;
  const from = range.from ? new Date(range.from) : undefined;
  const to = range.to ? new Date(range.to) : undefined;
  const fromOk = from && !Number.isNaN(from.getTime()) ? from : undefined;
  const toOk = to && !Number.isNaN(to.getTime()) ? to : undefined;
  if (fromOk && toOk) return Between(fromOk, toOk);
  if (fromOk) return MoreThanOrEqual(fromOk);
  if (toOk) return LessThanOrEqual(toOk);
  return undefined;
}

/** True when the range carries at least one usable bound. */
function hasRange(range: DateRange | undefined): boolean {
  if (!range) return false;
  const f = range.from ? Date.parse(range.from) : NaN;
  const t = range.to ? Date.parse(range.to) : NaN;
  return !Number.isNaN(f) || !Number.isNaN(t);
}

/**
 * Filter tenants by their signup day (`since`, `YYYY-MM-DD`) within the
 * window. Used by `/analytics/growth` so "growth over a period" is a real
 * cohort filter rather than a no-op.
 */
function tenantsInRange(tenants: TenantView[], range: DateRange | undefined): TenantView[] {
  if (!hasRange(range)) return tenants;
  const fromDay = range?.from ? new Date(range.from).toISOString().slice(0, 10) : undefined;
  const toDay = range?.to ? new Date(range.to).toISOString().slice(0, 10) : undefined;
  return tenants.filter((t) => {
    const since = t.since; // YYYY-MM-DD
    if (!since) return false;
    if (fromDay && since < fromDay) return false;
    if (toDay && since > toDay) return false;
    return true;
  });
}

/**
 * Analytics — every aggregate that drove the legacy HQ Postgres tables
 * is now derived from the canonical sources (nola-billing for tenants
 * + invoices, registry projection for apps, JetStream-backed
 * HealthService for service health). The TypeORM `Tenant` and `Invoice`
 * repos are left in `entities.ts` but no longer queried here.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Kpi) private readonly kpis: Repository<Kpi>,
    @InjectRepository(ActivityEvent)
    private readonly activity: Repository<ActivityEvent>,
    @InjectRepository(MomoEntry) private readonly momo: Repository<MomoEntry>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    private readonly apps: AppsService,
    private readonly tenants: TenantsService,
    private readonly invoices: InvoicesService,
    private readonly health: HealthService,
    private readonly snapshots: SnapshotsService,
  ) {}

  /**
   * The KPI cards on Finance + Dashboard. Each KPI's value is the live figure
   * and its `series` is the real daily history captured by SnapshotsService
   * (replacing the legacy static `kpis` table, which was never written to and
   * is no longer read here). Series are sparse until the daily job has run for
   * a few days — the UI renders that gracefully.
   *
   * `?from=&to=` windows the historical **series** (the sparkline) to the
   * requested calendar range. The headline `value` stays the live, current
   * figure (point-in-time, not a windowed aggregate); when a window is set
   * `value` falls back to the last in-window snapshot so the card and its
   * sparkline stay consistent.
   */
  async kpiList(range?: DateRange) {
    const windowed = hasRange(range);
    const [current, series] = await Promise.all([
      this.snapshots.currentMetrics(),
      windowed
        ? this.snapshots.seriesManyBetween(undefined, range?.from, range?.to)
        : this.snapshots.seriesMany(),
    ]);
    return buildKpiList(current, series);
  }

  /**
   * Single endpoint feeding the Dashboard screen. Pulls every aggregate
   * needed in one fan-out: tenants (billing), invoices (billing),
   * health (registry + metrics), local KPI/activity/momo/tickets rows
   * (still in HQ DB for now).
   *
   * `?from=&to=` applies to the parts that carry a real time dimension:
   *   - `kpis` series (windowed via kpiList),
   *   - `recent_activity` (filtered on `createdAt`).
   * Point-in-time figures (`summary.*`, tenant/health counts) describe the
   * current state and ignore the window — momo inflow likewise (its `ts`
   * column is a display label, not a reliable timestamp).
   */
  async dashboard(range?: DateRange) {
    const activityWhere: FindOptionsWhere<ActivityEvent> = {};
    const createdFilter = createdAtFilter(range);
    if (createdFilter) {
      (activityWhere as Record<string, unknown>).createdAt = createdFilter;
    }

    // Fields whose fetch failed this call — the summary still returns a
    // number for each (never undefined, the KPI cards expect one), but a
    // failure must NOT be silently reported as if it were the real 0: the
    // UI reads this to warn instead of showing e.g. "0 en retard" as if
    // billing had confirmed nothing is overdue.
    const summaryDegraded: string[] = [];

    const [tenantPage, invoiceSummary, activity, momoRows, ticketRows, kpis] =
      await Promise.all([
        this.tenants.list({ page: 1, limit: 1000 } as never),
        this.invoices.summary().catch((err: Error) => {
          this.logger.warn(`invoice summary failed: ${err?.message ?? err}`);
          summaryDegraded.push('overdue_cdf');
          return {
            total: 0,
            paid_cdf: 0,
            pending_cdf: 0,
            late_cdf: 0,
            overdue_cdf: 0,
          };
        }),
        this.activity.find({
          where: activityWhere,
          order: { createdAt: 'DESC' },
          take: 12,
        }),
        this.momo.find(),
        this.tickets.find(),
        this.kpiList(range),
      ]);
    const tenants = tenantPage.items;
    const appsList = this.apps.listApps();
    const health = this.health.findAll();

    const totalMrr = tenants.reduce((s, t) => s + t.mrr_cdf, 0);
    const activeTenants = tenants.filter((t) =>
      ['healthy', 'attention'].includes(t.status),
    ).length;
    const inflow = momoRows
      .filter((p) => p.kind === 'in')
      .reduce((s, p) => s + p.amt, 0);
    const npsValues = tenants
      .map((t) => t.nps)
      .filter((n): n is number => typeof n === 'number');
    const npsAvg = npsValues.length
      ? Math.round(npsValues.reduce((s, n) => s + n, 0) / npsValues.length)
      : 0;
    const openTickets = ticketRows.filter((t) => t.status === 'open').length;

    return {
      kpis,
      summary: {
        total_tenants: tenants.length,
        active_tenants: activeTenants,
        // Field name kept (legacy) — value is in USD, the canonical
        // currency used across nola-billing.
        total_mrr_cdf: totalMrr,
        overdue_cdf: invoiceSummary.overdue_cdf + invoiceSummary.late_cdf,
        momo_inflow_cdf: inflow,
        nps_avg: npsAvg,
        open_tickets: openTickets,
      },
      // Names of `summary` fields whose source fetch failed this call — the
      // value above is a zero placeholder, not a confirmed real 0. Empty
      // when everything fetched cleanly.
      summary_degraded: summaryDegraded,
      // Echo the applied window + which figures honour it, so the UI doesn't
      // render a "filtered" badge over numbers that are actually live.
      window: hasRange(range)
        ? {
            from: range?.from ?? null,
            to: range?.to ?? null,
            applies_to: ['kpis.series', 'recent_activity'],
            live: ['summary', 'health', 'apps'],
          }
        : null,
      recent_activity: activity,
      health,
      apps: appsList,
    };
  }

  async nps() {
    const { items: tenants } = await this.tenants.list({
      page: 1,
      limit: 1000,
    } as never);
    const scored = tenants.filter(
      (t): t is TenantView & { nps: number } => typeof t.nps === 'number',
    );
    const promoters = scored.filter((t) => t.nps >= 60).length;
    const passives = scored.filter((t) => t.nps >= 40 && t.nps < 60).length;
    const detractors = scored.filter((t) => t.nps < 40).length;
    const avg = scored.length
      ? scored.reduce((s, t) => s + t.nps, 0) / scored.length
      : 0;
    const byCountry = scored.reduce<
      Record<string, { count: number; avg: number }>
    >((acc, t) => {
      const cur = acc[t.country] ?? { count: 0, avg: 0 };
      acc[t.country] = {
        count: cur.count + 1,
        avg: (cur.avg * cur.count + t.nps) / (cur.count + 1),
      };
      return acc;
    }, {});
    // Real NPS history (daily snapshots) — replaces the hardcoded 12-point
    // trend the Nps screen used to render.
    const series = await this.snapshots.series('nps', 30);
    return {
      total_responses: scored.length,
      avg: Number(avg.toFixed(1)),
      promoters,
      passives,
      detractors,
      series,
      by_country: byCountry,
      detailed: scored.map((t) => ({
        id: t.id,
        name: t.name,
        country: t.country,
        plan: t.plan,
        nps: t.nps,
      })),
    };
  }

  /**
   * Used by the Analytics page. `by_country` and `by_plan` aggregate
   * counts + MRR across the canonical tenant set; `apps` is the
   * registry projection enriched with the count of tenants subscribed
   * via the billing subscriptions (one app per Tenant.apps entry).
   *
   * `?from=&to=` filters tenants by their signup day (`since`) — i.e. the
   * cohort that joined within the window. App registry metadata (version,
   * status, registeredAt) is live and not windowed.
   */
  async growth(range?: DateRange) {
    const { items: allTenants } = await this.tenants.list({
      page: 1,
      limit: 1000,
    } as never);
    const tenants = tenantsInRange(allTenants, range);
    const appsList = this.apps.listApps();

    const byCountry: Record<string, { count: number; mrr_cdf: number }> = {};
    const byPlan: Record<string, { count: number; mrr_cdf: number }> = {};
    const tenantsPerApp: Record<string, number> = {};
    const mrrPerApp: Record<string, number> = {};

    for (const t of tenants) {
      const country = t.country || '—';
      byCountry[country] = byCountry[country] ?? { count: 0, mrr_cdf: 0 };
      byCountry[country].count += 1;
      byCountry[country].mrr_cdf += t.mrr_cdf;

      const planKey = t.plan || 'free';
      byPlan[planKey] = byPlan[planKey] ?? { count: 0, mrr_cdf: 0 };
      byPlan[planKey].count += 1;
      byPlan[planKey].mrr_cdf += t.mrr_cdf;

      for (const a of t.apps) {
        tenantsPerApp[a] = (tenantsPerApp[a] ?? 0) + 1;
        mrrPerApp[a] = (mrrPerApp[a] ?? 0) + t.mrr_cdf;
      }
    }

    return {
      by_country: byCountry,
      by_plan: byPlan,
      window: hasRange(range)
        ? {
            from: range?.from ?? null,
            to: range?.to ?? null,
            applies_to: ['by_country', 'by_plan', 'apps.tenants', 'apps.mrr_cdf'],
            basis: 'tenant.since (signup day)',
          }
        : null,
      apps: appsList.map((a) => ({
        id: a.id,
        name: a.name,
        version: a.version,
        status: a.status,
        registeredAt: a.registeredAt,
        tenants: tenantsPerApp[a.id] ?? 0,
        mrr_cdf: mrrPerApp[a.id] ?? 0,
      })),
    };
  }
}
