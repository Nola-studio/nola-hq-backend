/**
 * Pure metric helpers for the daily snapshot system — no Nest/DB deps so they
 * can be unit-tested in isolation (`bun test`). SnapshotsService wires the
 * data fetch + persistence and delegates the math here.
 */

export type MetricUnit = 'cdf' | 'pct' | 'count';

export interface MetricDef {
  key: string;
  label: string;
  unit: MetricUnit;
  /** Lower is better (churn) — flips the delta colour on the UI. */
  invertColor?: boolean;
}

/**
 * The global KPIs captured once per day. Keys are stable and match the ids the
 * frontend already reads (`mrr`, `arr`, `tenants`, `nps`, `churn`).
 */
export const METRIC_DEFS: MetricDef[] = [
  { key: 'mrr', label: 'MRR consolidé', unit: 'cdf' },
  { key: 'arr', label: 'ARR (annualisé)', unit: 'cdf' },
  { key: 'tenants', label: 'Tenants actifs', unit: 'count' },
  { key: 'active_tenants', label: 'Tenants en bonne santé', unit: 'count' },
  { key: 'nps', label: 'NPS écosystème', unit: 'count' },
  { key: 'churn', label: 'Churn (risque)', unit: 'pct', invertColor: true },
  { key: 'open_tickets', label: 'Tickets ouverts', unit: 'count' },
];

export const METRIC_KEYS = METRIC_DEFS.map((d) => d.key);

/** Minimal tenant shape the metric math needs (decoupled from TenantView). */
export interface MetricTenant {
  mrr_cdf: number;
  status: string;
  nps: number | null;
}

/**
 * Compute today's value for every global metric from the canonical inputs.
 * `churn` is a current-state proxy (share of tenants in a churn-risk /
 * suspended state) — there's no historical cohort data to derive a true rate.
 */
export function computeMetrics(
  tenants: MetricTenant[],
  openTickets: number,
): Record<string, number> {
  const total = tenants.length;
  const mrr = tenants.reduce((s, t) => s + (Number.isFinite(t.mrr_cdf) ? t.mrr_cdf : 0), 0);
  const active = tenants.filter((t) => ['healthy', 'attention'].includes(t.status)).length;
  const atRisk = tenants.filter((t) => ['churn-risk', 'suspended'].includes(t.status)).length;
  const npsValues = tenants
    .map((t) => t.nps)
    .filter((n): n is number => typeof n === 'number');
  const nps = npsValues.length
    ? Math.round(npsValues.reduce((s, n) => s + n, 0) / npsValues.length)
    : 0;
  return {
    mrr,
    arr: mrr * 12,
    tenants: total,
    active_tenants: active,
    nps,
    churn: total ? Number(((atRisk / total) * 100).toFixed(1)) : 0,
    open_tickets: openTickets,
  };
}

/** ApiKpi shape the frontend consumes (src/lib/hooks.ts ApiKpi). */
export interface ApiKpi {
  id: string;
  label: string;
  value: number;
  unit: MetricUnit;
  delta: number;
  series: number[];
  invertColor: boolean;
}

/** Percent change between the first and last point of a series (0 if <2). */
export function deltaPct(series: number[]): number {
  if (series.length < 2) return 0;
  const first = series[0];
  const last = series[series.length - 1];
  if (!Number.isFinite(first) || first === 0) return 0;
  return Number((((last - first) / Math.abs(first)) * 100).toFixed(1));
}

/**
 * Assemble the KPI list the `/kpis` endpoint returns: current value + the real
 * snapshot series + a delta derived from that series. `value` prefers the
 * latest snapshot point and falls back to the live-computed current value
 * (covers the window before the first daily snapshot lands).
 */
export function buildKpiList(
  current: Record<string, number>,
  series: Record<string, number[]>,
): ApiKpi[] {
  return METRIC_DEFS.map((d) => {
    const s = series[d.key] ?? [];
    const value = s.length ? s[s.length - 1] : (current[d.key] ?? 0);
    return {
      id: d.key,
      label: d.label,
      value,
      unit: d.unit,
      delta: deltaPct(s),
      series: s,
      invertColor: d.invertColor ?? false,
    };
  });
}
