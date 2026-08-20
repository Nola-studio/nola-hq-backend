import type { EntityManager } from 'typeorm';

/**
 * Atomically reserves the next number for `prefix` in the given year and
 * formats it as `${prefix}-${year}-${00001}`. A single upsert-increment
 * statement (`ON CONFLICT ... DO UPDATE`) replaces the old
 * `findOne`-then-insert check, which let two concurrent creates both pass
 * the uniqueness check and mint the same number.
 *
 * Postgres does this in one round trip via `RETURNING`. SQLite (dev only —
 * `synchronize: true`, no real concurrent writers) does it in two statements
 * since its `RETURNING` support varies by bundled version; correctness there
 * doesn't depend on it.
 */
export async function nextBusinessNumber(manager: EntityManager, prefix: string, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const isPostgres = manager.connection.options.type === 'postgres';
  let lastValue: number;
  if (isPostgres) {
    const rows: Array<{ last_value: number }> = await manager.query(
      `INSERT INTO business_number_sequences (prefix, year, last_value) VALUES ($1, $2, 1)
       ON CONFLICT (prefix, year) DO UPDATE SET last_value = business_number_sequences.last_value + 1
       RETURNING last_value`,
      [prefix, year],
    );
    lastValue = rows[0].last_value;
  } else {
    await manager.query(
      `INSERT INTO business_number_sequences (prefix, year, last_value) VALUES (?, ?, 1)
       ON CONFLICT(prefix, year) DO UPDATE SET last_value = last_value + 1`,
      [prefix, year],
    );
    const rows: Array<{ last_value: number }> = await manager.query(
      `SELECT last_value FROM business_number_sequences WHERE prefix = ? AND year = ?`,
      [prefix, year],
    );
    lastValue = rows[0].last_value;
  }
  return `${prefix}-${year}-${String(lastValue).padStart(5, '0')}`;
}
