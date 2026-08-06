import { test, expect, describe } from 'bun:test';
import { resolvePeriod, inPeriod, monthsInRange, monthOf } from './studio.dashboard-period';

describe('resolvePeriod', () => {
  test('YTD defaults to the current year, capped at today', () => {
    expect(resolvePeriod({ period: 'ytd' }, '2026-08-04')).toEqual({
      start: '2026-01-01',
      end: '2026-08-04',
      label: '2026-01-01 → 2026-08-04',
    });
  });

  test('YTD for a past year runs the full calendar year', () => {
    expect(resolvePeriod({ period: 'ytd', year: 2024 }, '2026-08-04')).toEqual({
      start: '2024-01-01',
      end: '2024-12-31',
      label: '2024-01-01 → 2024-12-31',
    });
  });

  test('month mode uses the given year/month, full calendar month', () => {
    expect(resolvePeriod({ period: 'month', year: 2026, month: 2 }, '2026-08-04')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
      label: '2026-02-01 → 2026-02-28',
    });
  });

  test('month mode handles a leap year February', () => {
    expect(resolvePeriod({ period: 'month', year: 2024, month: 2 }, '2026-08-04')).toEqual({
      start: '2024-02-01',
      end: '2024-02-29',
      label: '2024-02-01 → 2024-02-29',
    });
  });

  test('month mode defaults month to the current month when omitted', () => {
    expect(resolvePeriod({ period: 'month', year: 2026 }, '2026-08-04')).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
      label: '2026-08-01 → 2026-08-31',
    });
  });

  test('year mode covers the full calendar year regardless of today', () => {
    expect(resolvePeriod({ period: 'year', year: 2026 }, '2026-03-15')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
      label: '2026-01-01 → 2026-12-31',
    });
  });

  test('no query defaults to the current calendar month', () => {
    expect(resolvePeriod({}, '2026-08-04')).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
      label: '2026-08-01 → 2026-08-31',
    });
  });
});

describe('inPeriod', () => {
  const range = { start: '2026-01-01', end: '2026-08-04', label: '' };

  test('null/undefined date is always in period', () => {
    expect(inPeriod(null, range)).toBe(true);
    expect(inPeriod(undefined, range)).toBe(true);
  });

  test('a date inside the range is in period', () => {
    expect(inPeriod('2026-05-05', range)).toBe(true);
  });

  test('a date on the boundary is in period (inclusive)', () => {
    expect(inPeriod('2026-01-01', range)).toBe(true);
    expect(inPeriod('2026-08-04', range)).toBe(true);
  });

  test('a date outside the range is not in period', () => {
    expect(inPeriod('2025-12-31', range)).toBe(false);
    expect(inPeriod('2026-08-05', range)).toBe(false);
  });
});

describe('monthsInRange', () => {
  test('Jan through Aug is 8 months', () => {
    expect(monthsInRange({ start: '2026-01-01', end: '2026-08-04', label: '' })).toBe(8);
  });

  test('a single month is 1', () => {
    expect(monthsInRange({ start: '2026-02-01', end: '2026-02-28', label: '' })).toBe(1);
  });

  test('a full year is 12', () => {
    expect(monthsInRange({ start: '2026-01-01', end: '2026-12-31', label: '' })).toBe(12);
  });
});

describe('monthOf', () => {
  test('extracts the month number from YYYY-MM-DD', () => {
    expect(monthOf('2026-08-04')).toBe(8);
    expect(monthOf('2026-01-01')).toBe(1);
  });

  test('null/undefined yields null', () => {
    expect(monthOf(null)).toBeNull();
    expect(monthOf(undefined)).toBeNull();
  });
});
