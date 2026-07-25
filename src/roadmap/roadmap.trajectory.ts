import { METRIC_DEFS } from '../analytics/snapshot.metrics';
import {
  ProgressInitiative,
  clampProgress,
  deriveObjectiveProgress,
} from './roadmap.progress';

/**
 * Pure OKR arithmetic for the roadmap — key results, planned trajectory and
 * the staged (annual → quarterly) progress cascade. No Nest/DB deps so it can
 * be unit-tested in isolation (`bun test`); `RoadmapService` only fetches and
 * persists, exactly like `roadmap.progress.ts` / `roadmap.board.ts`.
 *
 * Everything here is derived at read time and never written back: a key
 * result stores only its *plan* (baseline, target, direction, trajectory
 * points); its current value, progress and status are always recomputed.
 */

/**
 * Units a key result can be expressed in — the console's vocabulary. The
 * three first ones are exactly `MetricUnit` (so a metric-bound key result can
 * inherit its unit from `METRIC_DEFS`); `raw` covers the manual key results
 * that count anything else (signatures, écoles, tickets traités…).
 */
export const KEY_RESULT_UNITS = ['cdf', 'count', 'pct', 'raw'] as const;
export type KeyResultUnit = (typeof KEY_RESULT_UNITS)[number];

/** `up` = the target is above the baseline, `down` = below (churn, délais…). */
export const KEY_RESULT_DIRECTIONS = ['up', 'down'] as const;
export type KeyResultDirection = (typeof KEY_RESULT_DIRECTIONS)[number];

/** Where the measured value sits against the plan, today. */
export type KeyResultStatus =
  | 'ahead'
  | 'on_track'
  | 'at_risk'
  | 'behind'
  | 'unknown';

/** Minimal trajectory point shape the math needs (decoupled from the entity). */
export interface TrajectoryPointLike {
  /** `YYYY-MM-DD`. */
  date: string;
  /** PLANNED value at that date. Null points are ignored by the interpolation. */
  targetValue: number | null;
  /** Measured value — only used when the key result has no `metricKey`. */
  actualValue: number | null;
}

/** Minimal metric snapshot shape (decoupled from `MetricSnapshot`). */
export interface MetricPointLike {
  /** `YYYY-MM-DD`. */
  date: string;
  value: number;
}

/** Minimal key result shape the math needs (decoupled from the entity). */
export interface KeyResultLike {
  metricKey: string | null;
  baseline: number;
  target: number;
}

/** The derived fields every key result read carries. */
export interface KeyResultComputed {
  current: number | null;
  progress: number;
  plannedToday: number | null;
  status: KeyResultStatus;
}

export interface SeriesPoint {
  date: string;
  value: number;
}

/** The two curves the console charts for one key result. */
export interface KeyResultSeries {
  planned: SeriesPoint[];
  actual: SeriesPoint[];
}

/**
 * Defaults a metric-bound key result inherits from its metric: the metric's
 * own unit, and `down` when lower is better (`invertColor`, e.g. churn).
 * `null` for a manual key result or an unknown key — the caller then falls
 * back to what the operator sent.
 */
export function defaultsForMetric(
  metricKey: string | null | undefined,
): { unit: KeyResultUnit; direction: KeyResultDirection } | null {
  if (!metricKey) return null;
  const def = METRIC_DEFS.find((d) => d.key === metricKey);
  if (!def) return null;
  return { unit: def.unit, direction: def.invertColor ? 'down' : 'up' };
}

/**
 * The value a key result sits at right now.
 *
 *   - **metric-bound** (`metricKey` set) → the most recent
 *     `metric_snapshots` value at or before `today`. Nothing manual is ever
 *     entered for those: the daily capture is the source of truth.
 *   - **manual** → the most recent trajectory point carrying an
 *     `actualValue`.
 *
 * `null` when there is nothing to read (fresh key result, no snapshot yet).
 */
export function currentValue(
  metricKey: string | null,
  points: TrajectoryPointLike[],
  snapshots: MetricPointLike[],
  today: string,
): number | null {
  if (metricKey) {
    // `YYYY-MM-DD` compares lexically exactly like a date.
    const past = snapshots.filter((s) => s.date <= today);
    if (past.length === 0) return null;
    return latestBy(past, (s) => s.date).value;
  }
  const measured = points.filter((p) => p.actualValue !== null);
  if (measured.length === 0) return null;
  return latestBy(measured, (p) => p.date).actualValue;
}

/**
 * Progress of a key result, in percent, clamped to 0..100.
 *
 *   `(current - baseline) / (target - baseline)`
 *
 * handles `direction: 'down'` on its own: when the target is below the
 * baseline both differences are negative and the ratio stays positive. A
 * key result whose target equals its baseline is unmeasurable — 0, never a
 * division by zero. No current value ⇒ 0.
 */
export function keyResultProgress(
  current: number | null,
  baseline: number,
  target: number,
): number {
  if (current === null) return 0;
  if (target === baseline) return 0;
  return clampProgress(((current - baseline) / (target - baseline)) * 100);
}

/**
 * The PLANNED value at `date`, linearly interpolated between the two
 * surrounding trajectory points (sorted by date, null targets ignored):
 *
 *   - before the first point → the baseline (the plan starts there);
 *   - after the last point   → that last point's target (the plan is over);
 *   - in between             → the straight line joining the two points.
 *
 * `null` when the key result has no usable point at all — there is no plan
 * to compare against, not a plan that says "baseline".
 */
export function plannedValueAt(
  date: string,
  baseline: number,
  points: TrajectoryPointLike[],
): number | null {
  const planned = points
    .filter((p) => p.targetValue !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (planned.length === 0) return null;

  const first = planned[0];
  if (date < first.date) return baseline;

  const last = planned[planned.length - 1];
  if (date >= last.date) return last.targetValue;

  for (let i = 0; i < planned.length - 1; i++) {
    const from = planned[i];
    const to = planned[i + 1];
    if (date < from.date || date >= to.date) continue;
    const span = dayMs(to.date) - dayMs(from.date);
    if (!Number.isFinite(span) || span <= 0) return from.targetValue;
    const ratio = (dayMs(date) - dayMs(from.date)) / span;
    return (
      (from.targetValue as number) +
      ((to.targetValue as number) - (from.targetValue as number)) * ratio
    );
  }
  // Unreachable for well-formed `YYYY-MM-DD` dates (the loop covers the whole
  // range); keeps the function total rather than returning undefined.
  return last.targetValue;
}

/**
 * Where the measured value sits against the plan, today.
 *
 * `delta = (current - plannedNow) / span` with `span = target - baseline`.
 * `span` carries the sign of the direction, so a "down" key result that
 * over-delivers (current below plan) yields a *positive* delta just like an
 * "up" one — a single set of bands works for both.
 *
 * `unknown` when there is nothing to compare: no current value, no
 * trajectory point, or a key result whose target equals its baseline.
 */
export function onTrackStatus(
  current: number | null,
  plannedNow: number | null,
  baseline: number,
  target: number,
): KeyResultStatus {
  if (current === null || plannedNow === null) return 'unknown';
  const span = target - baseline;
  if (span === 0) return 'unknown';
  const delta = (current - plannedNow) / span;
  if (!Number.isFinite(delta)) return 'unknown';
  if (delta >= 0.05) return 'ahead';
  if (delta >= -0.05) return 'on_track';
  if (delta >= -0.2) return 'at_risk';
  return 'behind';
}

/** The four derived fields of one key result, in one pass. */
export function computeKeyResult(
  keyResult: KeyResultLike,
  points: TrajectoryPointLike[],
  snapshots: MetricPointLike[],
  today: string,
): KeyResultComputed {
  const current = currentValue(
    keyResult.metricKey,
    points,
    snapshots,
    today,
  );
  const plannedToday = plannedValueAt(today, keyResult.baseline, points);
  return {
    current,
    progress: keyResultProgress(current, keyResult.baseline, keyResult.target),
    plannedToday,
    status: onTrackStatus(
      current,
      plannedToday,
      keyResult.baseline,
      keyResult.target,
    ),
  };
}

/**
 * The two curves `GET /roadmap/key-results/:id/series` charts, both sorted by
 * date ascending:
 *
 *   - `planned` — the declared target points (the chart draws the straight
 *     segments between them, which is exactly what `plannedValueAt`
 *     interpolates);
 *   - `actual`  — the measured curve: the metric's snapshots for a
 *     metric-bound key result, the points' `actualValue` otherwise.
 */
export function buildKeyResultSeries(
  keyResult: Pick<KeyResultLike, 'metricKey'>,
  points: TrajectoryPointLike[],
  snapshots: MetricPointLike[],
): KeyResultSeries {
  const byDate = (a: SeriesPoint, b: SeriesPoint) => a.date.localeCompare(b.date);
  const planned = points
    .filter((p) => p.targetValue !== null)
    .map((p) => ({ date: p.date, value: p.targetValue as number }))
    .sort(byDate);
  const actual = keyResult.metricKey
    ? snapshots.map((s) => ({ date: s.date, value: s.value })).sort(byDate)
    : points
        .filter((p) => p.actualValue !== null)
        .map((p) => ({ date: p.date, value: p.actualValue as number }))
        .sort(byDate);
  return { planned, actual };
}

/** One objective as the cascade sees it (decoupled from the entity). */
export interface CascadeObjective {
  /** Stored fallback progress (`roadmap_objectives.progress`). */
  stored: number;
  /** Already-computed progress of each key result. */
  keyResults: number[];
  initiatives: ProgressInitiative[];
  /** Quarterly objectives pointing at this one (`parent_id`). */
  children: CascadeObjective[];
}

/** annual → quarterly only; anything deeper is rejected at write time. */
const MAX_CASCADE_DEPTH = 2;

/**
 * Effective progress of an objective. **Precedence, strongest first:**
 *
 *   1. **key results** — measured beats declared: the mean of their
 *      progress, whatever the initiatives or children say;
 *   2. **children** (annual objective) — the mean of the quarterly
 *      objectives' progress, each computed by rules 1 and 3;
 *   3. **initiatives** — the historical rule: the mean of the non-dropped
 *      ones (`deriveObjectiveProgress`);
 *   4. **stored value** — the operator's manual fallback when the objective
 *      carries nothing measurable at all.
 *
 * Recursion is capped at `MAX_CASCADE_DEPTH`: the write path forbids a
 * grandchild, and a legacy cycle must not hang a read.
 */
export function deriveCascadedObjectiveProgress(
  objective: CascadeObjective,
  depth = 0,
): number {
  if (objective.keyResults.length > 0) {
    const sum = objective.keyResults.reduce((s, p) => s + clampProgress(p), 0);
    return clampProgress(sum / objective.keyResults.length);
  }
  if (objective.children.length > 0 && depth < MAX_CASCADE_DEPTH) {
    const sum = objective.children.reduce(
      (s, c) => s + deriveCascadedObjectiveProgress(c, depth + 1),
      0,
    );
    return clampProgress(sum / objective.children.length);
  }
  const counted = objective.initiatives.filter((i) => i.status !== 'dropped');
  if (counted.length > 0) return deriveObjectiveProgress(counted);
  return clampProgress(objective.stored);
}

// ── internals ────────────────────────────────────────────────────

/** Epoch ms of a `YYYY-MM-DD` calendar day (UTC), `NaN` if unparseable. */
function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** The item with the highest key; ties keep the first one seen. */
function latestBy<T>(items: T[], key: (item: T) => string): T {
  return items.reduce((best, item) => (key(item) > key(best) ? item : best));
}
