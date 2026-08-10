/**
 * Pure period-filtering helpers for the workbook-mirroring dashboard
 * (Section A "Projets & Tâches" / Section B "Dépenses & Abonnements").
 * No Nest/DB deps — unit-tested standalone, same split as
 * `studio.board.ts` / `studio.dashboard-agg.ts`.
 *
 * Mirrors the workbook's own "In Period?" column: a date-less record is
 * always in period; a dated one is in period iff it falls within
 * `[start, end]` inclusive.
 */

export type StudioPeriodMode = 'ytd' | 'month' | 'year';

export interface StudioPeriodQuery {
  period?: StudioPeriodMode;
  /** Calendar year, e.g. `2026`. Defaults to the current year. */
  year?: number;
  /** 1-12. Only used when `period === 'month'`; defaults to the current month. */
  month?: number;
}

export interface PeriodRange {
  /** `YYYY-MM-DD`, inclusive. */
  start: string;
  /** `YYYY-MM-DD`, inclusive. */
  end: string;
  /** Matches the workbook's own "SHOWING 2026-01-01 → 2026-08-04" text. */
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `today` is injected (rather than read from `Date.now()` internally) so
 * this stays pure and trivially testable — same convention as the rest of
 * Studio's date logic.
 */
export function resolvePeriod(query: StudioPeriodQuery, today: string): PeriodRange {
  const [todayYear] = today.split('-').map(Number);
  const year = query.year ?? todayYear;

  let start: string;
  let end: string;

  if (query.period === 'year') {
    start = `${year}-01-01`;
    end = `${year}-12-31`;
  } else if (query.period === 'ytd') {
    // Jan 1 of `year` through `today`, capped at Dec 31 of `year` — for a
    // past year this is the same as the full-year range.
    start = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    end = today < yearEnd ? (today > start ? today : start) : yearEnd;
  } else {
    // Month (default when `period` is omitted): the current calendar month.
    const month = query.month ?? Number(today.split('-')[1]);
    start = `${year}-${pad2(month)}-01`;
    end = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`;
  }

  return { start, end, label: `${start} → ${end}` };
}

/** The workbook's own rule: blank date = always in period, dated = within range. */
export function inPeriod(dateStr: string | null | undefined, range: PeriodRange): boolean {
  if (!dateStr) return true;
  return dateStr >= range.start && dateStr <= range.end;
}

/** Number of distinct calendar months a range touches, e.g. Jan–Aug → 8. */
export function monthsInRange(range: PeriodRange): number {
  const [sy, sm] = range.start.split('-').map(Number);
  const [ey, em] = range.end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

/**
 * Every calendar month a range touches, in order — e.g. Jan-Aug 2026 →
 * `[1,2,3,4,5,6,7,8]`. Handles a range crossing a calendar year boundary
 * correctly, though none of `resolvePeriod`'s modes actually produce one
 * today (each is scoped to a single `year`).
 */
export function monthNumbersInRange(range: PeriodRange): number[] {
  const [sy, sm] = range.start.split('-').map(Number);
  const [ey, em] = range.end.split('-').map(Number);
  const months: number[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** `YYYY-MM-DD` → `1`..`12`, or `null` if unset — for month-bucketed bars. */
export function monthOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Number(dateStr.slice(5, 7));
}
