import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the hardcoded `PROVISIONABLE_PRODUCT_CODES` Set (company.constants.ts)
 * with a real, editable column so provisioning availability can be toggled
 * from Entreprises instead of requiring a code change + deploy. Seeded
 * `true` only for `yekoli`, matching the set's only member today — every
 * other product keeps the column's `false` default, same as before.
 *
 * Postgres-only — SQLite dev keeps `synchronize: true` and never runs
 * migrations (see src/data-source.ts).
 */
export class ProductIsProvisionable1789900000000 implements MigrationInterface {
  name = 'ProductIsProvisionable1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD COLUMN "is_provisionable" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "products" SET "is_provisionable" = true WHERE "code" = 'yekoli'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "is_provisionable"`);
  }
}
