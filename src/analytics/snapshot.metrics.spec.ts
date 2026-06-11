import { test, expect, describe } from 'bun:test';
import {
  computeMetrics,
  deltaPct,
  buildKpiList,
  METRIC_KEYS,
  type MetricTenant,
} from './snapshot.metrics';

const tenant = (over: Partial<MetricTenant> = {}): MetricTenant => ({
  mrr_cdf: 100,
  status: 'healthy',
  nps: 50,
  ...over,
});

describe('computeMetrics', () => {
  test('sums MRR, derives ARR, counts active and churn-risk tenants', () => {
    const m = computeMetrics(
      [
        tenant({ mrr_cdf: 100, status: 'healthy', nps: 60 }),
        tenant({ mrr_cdf: 50, status: 'attention', nps: 40 }),
        tenant({ mrr_cdf: 0, status: 'churn-risk', nps: null }),
        tenant({ mrr_cdf: 0, status: 'suspended', nps: 20 }),
      ],
      7,
    );
    expect(m.mrr).toBe(150);
    expect(m.arr).toBe(1800); // 150 * 12
    expect(m.tenants).toBe(4);
    expect(m.active_tenants).toBe(2); // healthy + attention
    expect(m.churn).toBe(50); // 2 of 4 at risk
    expect(m.nps).toBe(40); // avg of 60,40,20 (null excluded)
    expect(m.open_tickets).toBe(7);
  });

  test('non-finite MRR and empty input are handled', () => {
    expect(computeMetrics([tenant({ mrr_cdf: NaN })], 0).mrr).toBe(0);
    const empty = computeMetrics([], 0);
    expect(empty.tenants).toBe(0);
    expect(empty.churn).toBe(0);
    expect(empty.nps).toBe(0);
  });

  test('produces a value for every declared metric key', () => {
    const m = computeMetrics([tenant()], 1);
    for (const k of METRIC_KEYS) expect(typeof m[k]).toBe('number');
  });
});

describe('deltaPct', () => {
  test('percent change between first and last point', () => {
    expect(deltaPct([100, 110])).toBe(10);
    expect(deltaPct([200, 150])).toBe(-25);
  });
  test('0 when fewer than 2 points or first is 0', () => {
    expect(deltaPct([])).toBe(0);
    expect(deltaPct([5])).toBe(0);
    expect(deltaPct([0, 9])).toBe(0);
  });
});

describe('buildKpiList', () => {
  test('value prefers latest snapshot, falls back to live current', () => {
    const kpis = buildKpiList(
      { mrr: 999, arr: 0, tenants: 5, active_tenants: 0, nps: 0, churn: 0, open_tickets: 0 },
      { mrr: [100, 120, 140] }, // only mrr has history
    );
    const mrr = kpis.find((k) => k.id === 'mrr')!;
    expect(mrr.value).toBe(140); // latest snapshot point
    expect(mrr.series).toEqual([100, 120, 140]);
    expect(mrr.delta).toBe(40); // (140-100)/100

    const tenants = kpis.find((k) => k.id === 'tenants')!;
    expect(tenants.value).toBe(5); // no series → live current value
    expect(tenants.series).toEqual([]);
    expect(tenants.delta).toBe(0);
  });

  test('churn carries the invertColor flag', () => {
    const kpis = buildKpiList({ churn: 3 }, {});
    expect(kpis.find((k) => k.id === 'churn')!.invertColor).toBe(true);
    expect(kpis.find((k) => k.id === 'mrr')!.invertColor).toBe(false);
  });
});
