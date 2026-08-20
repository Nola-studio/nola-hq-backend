import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `receiptVoidedAt` — needed so the public verify endpoint can report "Ce
 * reçu a été annulé le [date]" instead of either a 404 or silently serving
 * an invalid receipt as valid forever. The token/number stay resolvable
 * after voiding; only this timestamp changes what verification reports.
 */
export class BusinessInvoiceReceiptVoid1788200000000 implements MigrationInterface {
  name = 'BusinessInvoiceReceiptVoid1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "receipt_voided_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "receipt_voided_at"`);
  }
}
