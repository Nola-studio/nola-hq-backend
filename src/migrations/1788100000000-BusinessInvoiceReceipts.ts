import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Receipt fields on BusinessInvoice — no separate entity, since the model is
 * strictly one payment = one invoice = one receipt (no join table needed).
 * `receiptNumber`/`paymentMethod`/`paymentReference`/`verificationToken` are
 * all minted together by `markPaid()`; `paidAt` (already present) doubles as
 * the payment date.
 */
export class BusinessInvoiceReceipts1788100000000 implements MigrationInterface {
  name = 'BusinessInvoiceReceipts1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "receipt_number" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD CONSTRAINT "UQ_business_invoices_receipt_number" UNIQUE ("receipt_number")`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "payment_method" character varying(24)`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "payment_reference" character varying(120)`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "verification_token" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD CONSTRAINT "UQ_business_invoices_verification_token" UNIQUE ("verification_token")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP CONSTRAINT "UQ_business_invoices_verification_token"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "verification_token"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "payment_reference"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "payment_method"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP CONSTRAINT "UQ_business_invoices_receipt_number"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "receipt_number"`);
  }
}
