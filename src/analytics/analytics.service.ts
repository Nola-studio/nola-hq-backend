import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kpi } from './kpi.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ActivityEvent } from '../activity/activity.entity';
import { Invoice } from '../invoices/invoice.entity';
import { MomoEntry } from '../momo/momo-entry.entity';
import { Ticket } from '../tickets/ticket.entity';
import { HealthEntry } from '../health/health-entry.entity';
import { AppEntity } from '../apps/app.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Kpi) private readonly kpis: Repository<Kpi>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(ActivityEvent)
    private readonly activity: Repository<ActivityEvent>,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectRepository(MomoEntry) private readonly momo: Repository<MomoEntry>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(HealthEntry)
    private readonly health: Repository<HealthEntry>,
    @InjectRepository(AppEntity) private readonly apps: Repository<AppEntity>,
  ) {}

  kpiList() {
    return this.kpis.find();
  }

  async dashboard() {
    const [tenants, activity, invoices, payments, tickets, health, apps] =
      await Promise.all([
        this.tenants.find(),
        this.activity.find({ order: { createdAt: 'DESC' }, take: 12 }),
        this.invoices.find(),
        this.momo.find(),
        this.tickets.find(),
        this.health.find(),
        this.apps.find(),
      ]);

    const kpis = await this.kpiList();

    const totalMrr = tenants.reduce((s, t) => s + t.mrrCdf, 0);
    const activeTenants = tenants.filter((t) =>
      ['healthy', 'attention'].includes(t.status),
    ).length;
    const overdue = invoices
      .filter((i) => ['late', 'overdue'].includes(i.status))
      .reduce((s, i) => s + i.amt, 0);
    const inflow = payments
      .filter((p) => p.kind === 'in')
      .reduce((s, p) => s + p.amt, 0);
    const npsValues = tenants.map((t) => t.nps).filter((n): n is number => n !== null);
    const npsAvg = npsValues.length
      ? Math.round(npsValues.reduce((s, n) => s + n, 0) / npsValues.length)
      : 0;
    const openTickets = tickets.filter((t) => t.status === 'open').length;

    return {
      kpis,
      summary: {
        total_tenants: tenants.length,
        active_tenants: activeTenants,
        total_mrr_cdf: totalMrr,
        overdue_cdf: overdue,
        momo_inflow_cdf: inflow,
        nps_avg: npsAvg,
        open_tickets: openTickets,
      },
      recent_activity: activity,
      health,
      apps,
    };
  }

  async nps() {
    const tenants = await this.tenants.find();
    const scored = tenants.filter((t) => t.nps !== null) as Array<
      Tenant & { nps: number }
    >;
    const promoters = scored.filter((t) => t.nps >= 60).length;
    const passives = scored.filter((t) => t.nps >= 40 && t.nps < 60).length;
    const detractors = scored.filter((t) => t.nps < 40).length;
    const avg = scored.length
      ? scored.reduce((s, t) => s + t.nps, 0) / scored.length
      : 0;
    return {
      total_responses: scored.length,
      avg: Number(avg.toFixed(1)),
      promoters,
      passives,
      detractors,
      by_country: scored.reduce<Record<string, { count: number; avg: number }>>(
        (acc, t) => {
          const cur = acc[t.country] ?? { count: 0, avg: 0 };
          const next = {
            count: cur.count + 1,
            avg: (cur.avg * cur.count + t.nps) / (cur.count + 1),
          };
          acc[t.country] = next;
          return acc;
        },
        {},
      ),
      detailed: scored.map((t) => ({
        id: t.id,
        name: t.name,
        country: t.country,
        plan: t.plan,
        nps: t.nps,
      })),
    };
  }

  async growth() {
    const tenants = await this.tenants.find();
    const apps = await this.apps.find();
    const byCountry: Record<string, { count: number; mrr_cdf: number }> = {};
    const byPlan: Record<string, { count: number; mrr_cdf: number }> = {};
    for (const t of tenants) {
      byCountry[t.country] = byCountry[t.country] ?? { count: 0, mrr_cdf: 0 };
      byCountry[t.country].count += 1;
      byCountry[t.country].mrr_cdf += t.mrrCdf;
      byPlan[t.plan] = byPlan[t.plan] ?? { count: 0, mrr_cdf: 0 };
      byPlan[t.plan].count += 1;
      byPlan[t.plan].mrr_cdf += t.mrrCdf;
    }
    return {
      by_country: byCountry,
      by_plan: byPlan,
      apps: apps.map((a) => ({
        id: a.id,
        name: a.name,
        tenants: a.tenants,
        mrr_cdf: a.mrrCdf,
        growth30: a.growth30,
      })),
    };
  }
}
