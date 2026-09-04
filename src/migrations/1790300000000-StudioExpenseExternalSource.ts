import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioExpenseExternalSource1790300000000 implements MigrationInterface {
  name = 'StudioExpenseExternalSource1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      ADD COLUMN "source" character varying NOT NULL DEFAULT 'manual'
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      ADD COLUMN "external_invoice_id" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      ADD COLUMN "receipt_url" character varying
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      ADD COLUMN "forecast_basis" jsonb
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_studio_expenses_external_invoice_id" 
      ON "studio_expenses" ("external_invoice_id") 
      WHERE "external_invoice_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_studio_expenses_external_invoice_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      DROP COLUMN IF EXISTS "forecast_basis"
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      DROP COLUMN IF EXISTS "receipt_url"
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      DROP COLUMN IF EXISTS "external_invoice_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "studio_expenses" 
      DROP COLUMN IF EXISTS "source"
    `);
  }
}
