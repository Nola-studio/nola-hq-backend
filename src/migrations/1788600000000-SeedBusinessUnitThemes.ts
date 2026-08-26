import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BusinessUnitTheme1788500000000 added the nullable `theme` column but
 * never populated it, so every business unit fell through to the code-level
 * default (`resolvePdfTheme()` → `'indigo'`) — khi-lab, vantelis-it, and
 * nolaa-corp all rendered identically. Assigns each brand its own palette,
 * resolved by `code` (never a hardcoded UUID), same convention as every
 * other seed migration in this repo (e.g. InvoiceBrandFields1788400000000).
 *
 * Postgres-only — SQLite dev keeps `synchronize: true` and never runs
 * migrations (see src/data-source.ts).
 */
export class SeedBusinessUnitThemes1788600000000 implements MigrationInterface {
  name = 'SeedBusinessUnitThemes1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "business_units" SET "theme" = 'indigo' WHERE "code" = 'khi-lab'`);
    await queryRunner.query(`UPDATE "business_units" SET "theme" = 'navy' WHERE "code" = 'vantelis-it'`);
    await queryRunner.query(`UPDATE "business_units" SET "theme" = 'slate' WHERE "code" = 'nolaa-corp'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "business_units" SET "theme" = NULL WHERE "code" IN ('khi-lab', 'vantelis-it', 'nolaa-corp')`,
    );
  }
}
