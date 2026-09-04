import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceSubscriptionIdAndUpcomingConstraint1790700000000 implements MigrationInterface {
  name = 'InvoiceSubscriptionIdAndUpcomingConstraint1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "subscription_id" character varying(64)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoices_subscription_due" ON "invoices" ("subscription_id", "due") WHERE "status" != 'cancelled' AND "subscription_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_invoices_subscription_due"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "subscription_id"`,
    );
  }
}
