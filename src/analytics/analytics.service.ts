import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kpi } from './kpi.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { AppsService } from '../apps/apps.service';
import { TenantsService, type TenantView } from '../tenants/tenants.service';
import { InvoicesService } from '../invoices/invoices.service';
import { HealthService } from '../health/health.service';

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
  ) {}

  kpiList() {
    return this.kpis.find();
  }

  /**
   * Single endpoint feeding the Dashboard screen. Pulls every aggregate
   * needed in one fan-out: tenants (billing), invoices (billing),
   * health (registry + metrics), local KPI/activity/momo/tickets rows
   * (still in HQ DB for now).
   */
  async dashboard() {
    const [tenantPage, invoiceSummary, activity, momoRows, ticketRows, kpis] =
      await Promise.all([
        this.tenants.list({ page: 1, limit: 1000 } as never),
        this.invoices.summary().catch((err: Error) => {
          this.logger.warn(`invoice summary failed: ${err?.message ?? err}`);
          return {
            total: 0,
            paid_cdf: 0,
            pending_cdf: 0,
            late_cdf: 0,
            overdue_cdf: 0,
          };
        }),
        this.activity.find({ order: { createdAt: 'DESC' }, take: 12 }),
        this.momo.find(),
        this.tickets.find(),
        this.kpiList(),
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
    return {
      total_responses: scored.length,
      avg: Number(avg.toFixed(1)),
      promoters,
      passives,
      detractors,
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
   */
  async growth() {
    const { items: tenants } = await this.tenants.list({
      page: 1,
      limit: 1000,
    } as never);
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
