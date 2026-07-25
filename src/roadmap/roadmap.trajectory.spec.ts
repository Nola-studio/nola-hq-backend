import { test, expect, describe } from 'bun:test';
import {
  buildKeyResultSeries,
  computeKeyResult,
  currentValue,
  defaultsForMetric,
  deriveCascadedObjectiveProgress,
  keyResultProgress,
  onTrackStatus,
  plannedValueAt,
  type CascadeObjective,
  type TrajectoryPointLike,
} from './roadmap.trajectory';

/**
 * The OKR read model rests on four rules:
 *   - progress is `(current - baseline) / (target - baseline)`, which covers
 *     both directions on its own;
 *   - the planned value is a linear interpolation of the trajectory points;
 *   - the on-track verdict is the signed gap to that planned value, in units
 *     of the span (so it is direction-agnostic too);
 *   - an objective's progress cascades: key results > children > initiatives
 *     > stored value.
 * Pure functions — no DB, no Nest.
 */

/** Trajectory point fixture: `pt('2026-03-31', 120)` plans 120 on that date. */
const pt = (
  date: string,
  targetValue: number | null = null,
  actualValue: number | null = null,
): TrajectoryPointLike => ({ date, targetValue, actualValue });

/** Cascade node fixture — everything empty unless overridden. */
const node = (over: Partial<CascadeObjective> = {}): CascadeObjective => ({
  stored: 0,
  keyResults: [],
  initiatives: [],
  children: [],
  ...over,
});

describe('defaultsForMetric', () => {
  test('inherits the metric unit and reading direction', () => {
    expect(defaultsForMetric('mrr')).toEqual({ unit: 'cdf', direction: 'up' });
    expect(defaultsForMetric('tenants')).toEqual({
      unit: 'count',
      direction: 'up',
    });
  });

  test('an inverted metric (lower is better) reads `down`', () => {
    expect(defaultsForMetric('churn')).toEqual({ unit: 'pct', direction: 'down' });
  });

  test('no metric, or an unknown one → no defaults to inherit', () => {
    expect(defaultsForMetric(null)).toBeNull();
    expect(defaultsForMetric('')).toBeNull();
    expect(defaultsForMetric('does_not_exist')).toBeNull();
  });
});

describe('currentValue', () => {
  test('metric-bound → the most recent snapshot at or before today', () => {
    const snapshots = [
      { date: '2026-07-01', value: 10 },
      { date: '2026-07-20', value: 42 },
      { date: '2026-08-01', value: 99 }, // future point, must be ignored
    ];
    expect(currentValue('mrr', [], snapshots, '2026-07-25')).toBe(42);
  });

  test('metric-bound with no snapshot yet → null', () => {
    expect(currentValue('mrr', [pt('2026-07-01', 5, 5)], [], '2026-07-25')).toBeNull();
  });

  test('metric-bound ignores the points’ manual actuals entirely', () => {
    const points = [pt('2026-07-24', null, 1000)];
    const snapshots = [{ date: '2026-07-10', value: 7 }];
    expect(currentValue('mrr', points, snapshots, '2026-07-25')).toBe(7);
  });

  test('manual → the most recent point carrying an actual', () => {
    const points = [
      pt('2026-07-01', 10, 8),
      pt('2026-07-15', 20, 17),
      pt('2026-07-31', 30, null), // planned only
    ];
    expect(currentValue(null, points, [], '2026-07-25')).toBe(17);
  });

  test('manual with no measured point → null', () => {
    expect(currentValue(null, [pt('2026-07-01', 10)], [], '2026-07-25')).toBeNull();
    expect(currentValue(null, [], [], '2026-07-25')).toBeNull();
  });

  test('a measured 0 is a value, not an absence', () => {
    expect(currentValue(null, [pt('2026-07-01', 10, 0)], [], '2026-07-25')).toBe(0);
  });
});

describe('keyResultProgress', () => {
  test('direction up: linear from baseline to target', () => {
    expect(keyResultProgress(0, 0, 100)).toBe(0);
    expect(keyResultProgress(50, 0, 100)).toBe(50);
    expect(keyResultProgress(100, 0, 100)).toBe(100);
    expect(keyResultProgress(1500, 1000, 3000)).toBe(25);
  });

  test('direction down: the same formula, both differences negative', () => {
    // churn 8% → 4%, currently 6% ⇒ half way.
    expect(keyResultProgress(6, 8, 4)).toBe(50);
    expect(keyResultProgress(8, 8, 4)).toBe(0);
    expect(keyResultProgress(4, 8, 4)).toBe(100);
    // Went the wrong way (worse than the baseline) ⇒ clamped to 0.
    expect(keyResultProgress(9, 8, 4)).toBe(0);
  });

  test('clamps outside the baseline..target range', () => {
    expect(keyResultProgress(150, 0, 100)).toBe(100);
    expect(keyResultProgress(-20, 0, 100)).toBe(0);
  });

  test('target === baseline → 0, never a division by zero', () => {
    expect(keyResultProgress(50, 50, 50)).toBe(0);
    expect(keyResultProgress(0, 50, 50)).toBe(0);
    expect(keyResultProgress(999, 50, 50)).toBe(0);
    expect(Number.isFinite(keyResultProgress(1, 0, 0))).toBe(true);
  });

  test('no current value → 0', () => {
    expect(keyResultProgress(null, 0, 100)).toBe(0);
  });

  test('rounds to the nearest integer percent', () => {
    expect(keyResultProgress(1, 0, 3)).toBe(33); // 33.33
    expect(keyResultProgress(2, 0, 3)).toBe(67); // 66.67
  });
});

describe('plannedValueAt', () => {
  const points = [
    pt('2026-04-01', 0),
    pt('2026-05-01', 100),
    pt('2026-06-01', 400),
  ];

  test('before the first point → the baseline', () => {
    expect(plannedValueAt('2026-01-15', -50, points)).toBe(-50);
    expect(plannedValueAt('2026-03-31', 7, points)).toBe(7);
  });

  test('on a point → that point’s planned value', () => {
    expect(plannedValueAt('2026-04-01', 7, points)).toBe(0);
    expect(plannedValueAt('2026-05-01', 7, points)).toBe(100);
    expect(plannedValueAt('2026-06-01', 7, points)).toBe(400);
  });

  test('between two points → linear interpolation', () => {
    // 2026-04-01 → 2026-05-01 is 30 days; half way is the 16th.
    expect(plannedValueAt('2026-04-16', 7, points)).toBe(50);
    // 2026-05-01 → 2026-06-01 is 31 days; +10 days ⇒ 100 + 300*10/31.
    expect(plannedValueAt('2026-05-11', 7, points)).toBeCloseTo(196.774, 3);
  });

  test('after the last point → the last planned value', () => {
    expect(plannedValueAt('2026-06-02', 7, points)).toBe(400);
    expect(plannedValueAt('2030-01-01', 7, points)).toBe(400);
  });

  test('unsorted input is sorted before interpolating', () => {
    const shuffled = [pt('2026-06-01', 400), pt('2026-04-01', 0), pt('2026-05-01', 100)];
    expect(plannedValueAt('2026-04-16', 7, shuffled)).toBe(50);
    expect(plannedValueAt('2026-03-01', 7, shuffled)).toBe(7);
  });

  test('points with no planned value are ignored', () => {
    const mixed = [pt('2026-04-01', 0), pt('2026-04-16', null, 999), pt('2026-05-01', 100)];
    expect(plannedValueAt('2026-04-16', 7, mixed)).toBe(50); // interpolated, not 999
    const onlyActuals = [pt('2026-04-01', null, 12)];
    expect(plannedValueAt('2026-04-01', 7, onlyActuals)).toBeNull();
  });

  test('no trajectory at all → null (there is no plan, not a flat one)', () => {
    expect(plannedValueAt('2026-04-16', 7, [])).toBeNull();
  });

  test('a single point still plans: baseline before, that value after', () => {
    const one = [pt('2026-05-01', 250)];
    expect(plannedValueAt('2026-04-01', 10, one)).toBe(10);
    expect(plannedValueAt('2026-05-01', 10, one)).toBe(250);
    expect(plannedValueAt('2026-09-01', 10, one)).toBe(250);
  });
});

describe('onTrackStatus', () => {
  // span = 100 ⇒ one point of delta is one percent of the span.
  const band = (current: number) => onTrackStatus(current, 50, 0, 100);

  test('the five bands, direction up', () => {
    expect(band(60)).toBe('ahead'); // +0.10
    expect(band(55)).toBe('ahead'); // +0.05, boundary is inclusive
    expect(band(54)).toBe('on_track'); // +0.04
    expect(band(50)).toBe('on_track'); // exactly on plan
    expect(band(45)).toBe('on_track'); // -0.05, boundary is inclusive
    expect(band(44)).toBe('at_risk'); // -0.06
    expect(band(30)).toBe('at_risk'); // -0.20, boundary is inclusive
    expect(band(29)).toBe('behind'); // -0.21
    expect(band(0)).toBe('behind');
  });

  test('direction down: the span carries the sign, the bands do not move', () => {
    // churn 8 → 4 (span -4), plan says 6 today.
    expect(onTrackStatus(5.5, 6, 8, 4)).toBe('ahead'); // below plan = better
    expect(onTrackStatus(6, 6, 8, 4)).toBe('on_track');
    expect(onTrackStatus(6.5, 6, 8, 4)).toBe('at_risk'); // +0.5/-4 = -0.125
    expect(onTrackStatus(7.5, 6, 8, 4)).toBe('behind'); // +1.5/-4 = -0.375
  });

  test('nothing to compare → unknown', () => {
    expect(onTrackStatus(null, 50, 0, 100)).toBe('unknown'); // no measure
    expect(onTrackStatus(50, null, 0, 100)).toBe('unknown'); // no trajectory
    expect(onTrackStatus(50, 50, 50, 50)).toBe('unknown'); // unmeasurable span
  });
});

describe('computeKeyResult', () => {
  test('metric-bound: snapshots drive current, progress and status', () => {
    const kr = { metricKey: 'mrr', baseline: 1000, target: 3000 };
    const points = [pt('2026-06-01', 1000), pt('2026-09-01', 3000)];
    const snapshots = [
      { date: '2026-07-01', value: 1500 },
      { date: '2026-07-24', value: 2000 },
    ];
    const out = computeKeyResult(kr, points, snapshots, '2026-07-25');
    expect(out.current).toBe(2000);
    expect(out.progress).toBe(50); // (2000-1000)/2000
    // 2026-06-01 → 2026-09-01 is 92 days; 2026-07-25 is day 54.
    expect(out.plannedToday).toBeCloseTo(1000 + 2000 * (54 / 92), 3);
    expect(out.status).toBe('at_risk'); // ~ -0.087 of the span
  });

  test('manual: the points’ actuals drive it, no snapshot involved', () => {
    const kr = { metricKey: null, baseline: 0, target: 10 };
    const points = [pt('2026-07-01', 5, 5), pt('2026-08-01', 10)];
    const out = computeKeyResult(kr, points, [{ date: '2026-07-25', value: 999 }], '2026-07-25');
    expect(out.current).toBe(5);
    expect(out.progress).toBe(50);
    expect(out.plannedToday).toBeCloseTo(5 + 5 * (24 / 31), 3);
    expect(out.status).toBe('behind'); // 5 vs ~8.9 planned ⇒ -0.39 of the span
  });

  test('a brand new key result reads as unknown, progress 0', () => {
    const out = computeKeyResult(
      { metricKey: null, baseline: 0, target: 100 },
      [],
      [],
      '2026-07-25',
    );
    expect(out).toEqual({
      current: null,
      progress: 0,
      plannedToday: null,
      status: 'unknown',
    });
  });
});

describe('buildKeyResultSeries', () => {
  test('metric-bound: planned from the points, actual from the snapshots', () => {
    const points = [pt('2026-09-01', 3000), pt('2026-06-01', 1000, 42)];
    const snapshots = [
      { date: '2026-07-24', value: 2000 },
      { date: '2026-07-01', value: 1500 },
    ];
    expect(buildKeyResultSeries({ metricKey: 'mrr' }, points, snapshots)).toEqual({
      planned: [
        { date: '2026-06-01', value: 1000 },
        { date: '2026-09-01', value: 3000 },
      ],
      actual: [
        { date: '2026-07-01', value: 1500 },
        { date: '2026-07-24', value: 2000 },
      ],
    });
  });

  test('manual: both curves come from the points, nulls dropped', () => {
    const points = [
      pt('2026-08-01', 10, null),
      pt('2026-07-01', 5, 4),
      pt('2026-06-01', null, 1),
    ];
    expect(buildKeyResultSeries({ metricKey: null }, points, [])).toEqual({
      planned: [
        { date: '2026-07-01', value: 5 },
        { date: '2026-08-01', value: 10 },
      ],
      actual: [
        { date: '2026-06-01', value: 1 },
        { date: '2026-07-01', value: 4 },
      ],
    });
  });

  test('nothing planned, nothing measured → two empty curves', () => {
    expect(buildKeyResultSeries({ metricKey: null }, [], [])).toEqual({
      planned: [],
      actual: [],
    });
  });
});

describe('deriveCascadedObjectiveProgress', () => {
  test('key results win over everything else (measured beats declared)', () => {
    expect(
      deriveCascadedObjectiveProgress(
        node({
          stored: 90,
          keyResults: [20, 80],
          initiatives: [{ status: 'shipped', progress: 100 }],
        }),
      ),
    ).toBe(50);
  });

  test('no key result → the historical rule (mean of non-dropped initiatives)', () => {
    expect(
      deriveCascadedObjectiveProgress(
        node({
          stored: 90,
          initiatives: [
            { status: 'in_progress', progress: 20 },
            { status: 'shipped', progress: 100 },
            { status: 'dropped', progress: 0 },
          ],
        }),
      ),
    ).toBe(60);
  });

  test('nothing measurable → the stored fallback, clamped', () => {
    expect(deriveCascadedObjectiveProgress(node({ stored: 42 }))).toBe(42);
    expect(
      deriveCascadedObjectiveProgress(
        node({ stored: 42, initiatives: [{ status: 'dropped', progress: 100 }] }),
      ),
    ).toBe(42);
    expect(deriveCascadedObjectiveProgress(node({ stored: 250 }))).toBe(100);
  });

  test('an annual objective is the mean of its quarterly children', () => {
    const annual = node({
      stored: 5,
      children: [
        node({ keyResults: [100] }), // Q1 measured
        node({ initiatives: [{ status: 'shipped', progress: 50 }] }), // Q2 delivered
        node({ stored: 30 }), // Q3 declared only
      ],
    });
    expect(deriveCascadedObjectiveProgress(annual)).toBe(60); // (100+50+30)/3
  });

  test('three levels: key results → quarterly → annual', () => {
    const annual = node({
      children: [
        node({ keyResults: [40, 60], stored: 99 }), // 50
        node({ keyResults: [100, 0], stored: 99 }), // 50
      ],
    });
    expect(deriveCascadedObjectiveProgress(annual)).toBe(50);
  });

  test('an annual objective with its own key results uses them, not its children', () => {
    const annual = node({
      keyResults: [10],
      children: [node({ keyResults: [100] })],
    });
    expect(deriveCascadedObjectiveProgress(annual)).toBe(10);
  });

  test('rounds the mean to an integer', () => {
    expect(deriveCascadedObjectiveProgress(node({ keyResults: [10, 10, 11] }))).toBe(10);
    expect(deriveCascadedObjectiveProgress(node({ keyResults: [50, 51] }))).toBe(51);
  });

  test('a legacy cycle cannot hang the read (depth is capped)', () => {
    const loop = node({ stored: 12 });
    loop.children = [loop];
    expect(deriveCascadedObjectiveProgress(loop)).toBe(12);
  });
});
