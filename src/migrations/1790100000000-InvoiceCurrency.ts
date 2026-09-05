import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceCurrency1790100000000 implements MigrationInterface {
  name = 'InvoiceCurrency1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "currency" character varying(10) NOT NULL DEFAULT 'USD'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP COLUMN IF EXISTS "currency"`,
    );
  }
}
