import { test, expect, describe, mock } from 'bun:test';
import { nextBusinessNumber } from './business-number-sequence';

/**
 * `nextBusinessNumber` branches on driver type (`RETURNING` on Postgres vs.
 * insert-then-select on SQLite) — these fakes drive both paths against the
 * same in-memory `(prefix, year) -> last_value` map the real upsert would
 * maintain, without needing a real database connection.
 */
function makePostgresManager(rows: Record<string, number>) {
  const query = mock(async (_sql: string, params: unknown[]) => {
    const [prefix, year] = params as [string, number];
    const key = `${prefix}:${year}`;
    rows[key] = (rows[key] ?? 0) + 1;
    return [{ last_value: rows[key] }];
  });
  return { connection: { options: { type: 'postgres' } }, query } as any;
}

function makeSqliteManager(rows: Record<string, number>) {
  const query = mock(async (sql: string, params: unknown[]) => {
    const [prefix, year] = params as [string, number];
    const key = `${prefix}:${year}`;
    if (sql.trim().startsWith('INSERT')) {
      rows[key] = (rows[key] ?? 0) + 1;
      return [];
    }
    return [{ last_value: rows[key] }];
  });
  return { connection: { options: { type: 'sqlite' } }, query } as any;
}

describe('nextBusinessNumber', () => {
  test('formats as PREFIX-YEAR-00001 and increments per call, Postgres path', async () => {
    const rows: Record<string, number> = {};
    const manager = makePostgresManager(rows);
    const now = new Date('2026-03-01T00:00:00Z');
    expect(await nextBusinessNumber(manager, 'FAC', now)).toBe('FAC-2026-00001');
    expect(await nextBusinessNumber(manager, 'FAC', now)).toBe('FAC-2026-00002');
    expect(await nextBusinessNumber(manager, 'FAC', now)).toBe('FAC-2026-00003');
  });

  test('each prefix has its own independent counter', async () => {
    const rows: Record<string, number> = {};
    const manager = makePostgresManager(rows);
    const now = new Date('2026-03-01T00:00:00Z');
    expect(await nextBusinessNumber(manager, 'FAC', now)).toBe('FAC-2026-00001');
    expect(await nextBusinessNumber(manager, 'DEV', now)).toBe('DEV-2026-00001');
    expect(await nextBusinessNumber(manager, 'REC', now)).toBe('REC-2026-00001');
    expect(await nextBusinessNumber(manager, 'FAC', now)).toBe('FAC-2026-00002');
  });

  test('year-scoping resets the counter for a new year', async () => {
    const rows: Record<string, number> = {};
    const manager = makePostgresManager(rows);
    expect(await nextBusinessNumber(manager, 'FAC', new Date('2026-12-31T00:00:00Z'))).toBe('FAC-2026-00001');
    expect(await nextBusinessNumber(manager, 'FAC', new Date('2027-01-01T00:00:00Z'))).toBe('FAC-2027-00001');
  });

  test('SQLite (dev) path produces the same numbering', async () => {
    const rows: Record<string, number> = {};
    const manager = makeSqliteManager(rows);
    const now = new Date('2026-01-01T00:00:00Z');
    expect(await nextBusinessNumber(manager, 'REC', now)).toBe('REC-2026-00001');
    expect(await nextBusinessNumber(manager, 'REC', now)).toBe('REC-2026-00002');
  });
});
