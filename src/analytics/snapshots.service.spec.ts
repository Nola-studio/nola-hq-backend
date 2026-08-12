import { test, expect, describe, mock } from 'bun:test';
import { SnapshotsService } from './snapshots.service';
import { METRIC_KEYS } from './snapshot.metrics';
import type { Repository } from 'typeorm';
import type { MetricSnapshot } from './metric-snapshot.entity';
import type { Ticket } from '../tickets/ticket.entity';
import type { TenantsService } from '../tenants/tenants.service';

/**
 * captureDaily() has two genuinely distinct failure/edge paths (confirmed by
 * reading the source, not assumed):
 *   (a) tenants.list()/tickets.count() throws → caught, logged, repo.upsert
 *       is never called — no rows written for that day.
 *   (b) both calls succeed but resolve to an empty tenant set → computeMetrics
 *       returns an all-zero metrics object, and captureDaily proceeds to
 *       upsert one zero-valued row per METRIC_KEYS. There is no guard that
 *       skips the write for an empty-but-successful payload — only a thrown
 *       error skips the write. This test locks in that distinction: (b) is
 *       NOT a no-op, unlike (a).
 */

function makeService(opts: {
  tenantsList: () => Promise<{ items: unknown[] }>;
  ticketsCount?: () => Promise<number>;
}) {
  const upsert = mock(async () => undefined);
  const repo = { upsert } as unknown as Repository<MetricSnapshot>;
  const tickets = {
    count: opts.ticketsCount ?? (async () => 0),
  } as unknown as Repository<Ticket>;
  const tenants = { list: opts.tenantsList } as unknown as TenantsService;
  const service = new SnapshotsService(repo, tickets, tenants);
  return { service, upsert };
}

describe('SnapshotsService.captureDaily', () => {
  test('(a) upstream fetch throws: caught, logged, nothing written', async () => {
    const { service, upsert } = makeService({
      tenantsList: async () => {
        throw new Error('billing NATS unreachable');
      },
    });

    await expect(service.captureDaily()).resolves.toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
  });

  test('(b) upstream succeeds with an empty tenant set: still writes one zero-valued row per metric (not skipped)', async () => {
    const { service, upsert } = makeService({
      tenantsList: async () => ({ items: [] }),
      ticketsCount: async () => 0,
    });

    await service.captureDaily();

    expect(upsert).toHaveBeenCalledTimes(METRIC_KEYS.length);
    for (const [row] of upsert.mock.calls) {
      const r = row as { metricKey: string; value: number };
      expect(METRIC_KEYS).toContain(r.metricKey);
      expect(r.value).toBe(0);
    }
  });

  test('successful non-empty payload writes real computed values', async () => {
    const { service, upsert } = makeService({
      tenantsList: async () => ({
        items: [{ mrr_cdf: 100, status: 'healthy', nps: 80 }],
      }),
      ticketsCount: async () => 3,
    });

    await service.captureDaily();

    expect(upsert).toHaveBeenCalledTimes(METRIC_KEYS.length);
    const byKey = new Map(
      upsert.mock.calls.map(([row]) => {
        const r = row as { metricKey: string; value: number };
        return [r.metricKey, r.value];
      }),
    );
    expect(byKey.get('mrr')).toBe(100);
    expect(byKey.get('tenants')).toBe(1);
    expect(byKey.get('open_tickets')).toBe(3);
  });
});
