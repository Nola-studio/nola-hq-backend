import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { MetricSnapshot } from './metric-snapshot.entity';
import { Ticket } from '../tickets/ticket.entity';
import { TenantsService } from '../tenants/tenants.service';
import { computeMetrics, METRIC_KEYS } from './snapshot.metrics';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day `YYYY-MM-DD` (UTC) for a given instant. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Coerce an ISO date/datetime string to its `YYYY-MM-DD` calendar day, or
 * `undefined` if absent/unparseable. Used to window the snapshot series,
 * whose `date` column is a `YYYY-MM-DD` string (lexical compare == date
 * compare for that format).
 */
function toDayKey(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * SnapshotsService — captures one daily data point per global metric so the
 * console can render real historical sparklines. Follows the in-process
 * scheduler pattern used by HealthService (OnApplicationBootstrap + setInterval
 * + OnModuleDestroy) since the project doesn't use @nestjs/schedule.
 *
 * Forward-only: there's no past MRR/NPS state to backfill, so series start at a
 * single point and fill in day by day.
 */
@Injectable()
export class SnapshotsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SnapshotsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(MetricSnapshot)
    private readonly repo: Repository<MetricSnapshot>,
    @InjectRepository(Ticket)
    private readonly tickets: Repository<Ticket>,
    private readonly tenants: TenantsService,
  ) {}

  onApplicationBootstrap(): void {
    // One capture shortly after boot (so a fresh deploy has today's point),
    // then once a day. Errors are swallowed — a transient billing outage must
    // not crash the app or stop future captures.
    setTimeout(() => void this.captureDaily(), 3_000);
    this.timer = setInterval(() => void this.captureDaily(), DAY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Live value for every global metric (also used by /kpis). */
  async currentMetrics(): Promise<Record<string, number>> {
    const [tenantPage, openTickets] = await Promise.all([
      this.tenants.list({ page: 1, limit: 1000 } as never),
      this.tickets.count({ where: { status: 'open' } }),
    ]);
    return computeMetrics(tenantPage.items, openTickets);
  }

  /** Compute + persist today's snapshot for every metric (idempotent). */
  async captureDaily(): Promise<void> {
    try {
      const metrics = await this.currentMetrics();
      const date = dayKey(new Date());
      for (const key of METRIC_KEYS) {
        await this.repo.upsert(
          { metricKey: key, date, value: metrics[key] ?? 0 },
          ['metricKey', 'date'],
        );
      }
      this.logger.log(`Captured daily metric snapshot for ${date}`);
    } catch (err) {
      this.logger.warn(
        `Daily snapshot capture skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Last `days` values for one metric, oldest → newest. */
  async series(metricKey: string, days = 30): Promise<number[]> {
    const rows = await this.repo.find({
      where: { metricKey },
      order: { date: 'ASC' },
    });
    return rows.slice(-days).map((r) => r.value);
  }

  /** Last `days` values for several metrics in one query. */
  async seriesMany(
    keys: string[] = METRIC_KEYS,
    days = 30,
  ): Promise<Record<string, number[]>> {
    const rows = await this.repo.find({
      where: { metricKey: In(keys) },
      order: { date: 'ASC' },
    });
    const out: Record<string, number[]> = {};
    for (const k of keys) out[k] = [];
    for (const r of rows) (out[r.metricKey] ??= []).push(r.value);
    for (const k of keys) out[k] = out[k].slice(-days);
    return out;
  }

  /**
   * Series for several metrics restricted to an inclusive `[from, to]`
   * calendar-day window. When both bounds are omitted this is equivalent to
   * `seriesMany` (full history). Bounds compare lexically on the
   * `YYYY-MM-DD` `date` column. Unlike `seriesMany` there is no `days` cap —
   * the window itself bounds the result.
   */
  async seriesManyBetween(
    keys: string[] = METRIC_KEYS,
    from?: string,
    to?: string,
  ): Promise<Record<string, number[]>> {
    const fromDay = toDayKey(from);
    const toDay = toDayKey(to);
    const dateFilter =
      fromDay && toDay
        ? Between(fromDay, toDay)
        : fromDay
          ? MoreThanOrEqual(fromDay)
          : toDay
            ? LessThanOrEqual(toDay)
            : undefined;
    const rows = await this.repo.find({
      where: dateFilter
        ? { metricKey: In(keys), date: dateFilter }
        : { metricKey: In(keys) },
      order: { date: 'ASC' },
    });
    const out: Record<string, number[]> = {};
    for (const k of keys) out[k] = [];
    for (const r of rows) (out[r.metricKey] ??= []).push(r.value);
    return out;
  }
}
