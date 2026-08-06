import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillKeyPrefixes } from '../roadmap/roadmap-identifier';

/**
 * Data-only migration: assigns `keyPrefix` to every `roadmap_initiatives`
 * row that predates auto-generated identifiers (item 2 of the Studio
 * merge) and never got one — e.g. rows created before that convention
 * existed. Uses the same slugify + numeric-suffix-on-collision rule as
 * `RoadmapService.generateKeyPrefix()` (shared via `backfillKeyPrefixes`,
 * unit-tested in `roadmap-identifier.spec.ts`), ordered by `created_at` so
 * re-running is a no-op (every row already has a prefix after the first
 * run).
 *
 * No rollback: `down()` can't recover which rows were null before this ran.
 */
export class BackfillNullKeyPrefixes1786900000000 implements MigrationInterface {
  name = 'BackfillNullKeyPrefixes1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ key_prefix: string }> = await queryRunner.query(
      `SELECT key_prefix FROM "roadmap_initiatives" WHERE key_prefix IS NOT NULL`,
    );
    const rows: Array<{ id: string; title: string }> = await queryRunner.query(
      `SELECT id, title FROM "roadmap_initiatives" WHERE key_prefix IS NULL ORDER BY created_at ASC`,
    );
    if (rows.length === 0) return;

    const assignments = backfillKeyPrefixes(
      rows,
      existing.map((r) => r.key_prefix),
    );
    for (const a of assignments) {
      await queryRunner.query(`UPDATE "roadmap_initiatives" SET key_prefix = $1 WHERE id = $2`, [
        a.keyPrefix,
        a.id,
      ]);
    }
  }

  public async down(): Promise<void> {
    // Intentionally irreversible — see class doc comment.
  }
}
