import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional itemized breakdown for invoices, mirroring `business_quote_lines`,
 * plus real tax fields on the invoice itself (mirroring `business_quotes`).
 * Until now `convertQuote()` collapsed a quote's lines into a single
 * description string and dropped its tax entirely, destroying both at
 * conversion time.
 */
export class BusinessInvoiceLines1787900000000 implements MigrationInterface {
  name = 'BusinessInvoiceLines1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "business_invoice_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "invoice_id" uuid NOT NULL, "description" character varying(240) NOT NULL, "quantity" numeric(10,2) NOT NULL, "unit_price_cdf" bigint NOT NULL, "total_cdf" bigint NOT NULL, "position" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_business_invoice_lines" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_business_invoice_lines_invoice" ON "business_invoice_lines" ("invoice_id")`);
    await queryRunner.query(`ALTER TABLE "business_invoice_lines" ADD CONSTRAINT "FK_business_invoice_lines_invoice" FOREIGN KEY ("invoice_id") REFERENCES "business_invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "tax_rate" numeric(5,2) NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "tax_cdf" bigint NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "tax_label" character varying(40)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "tax_label"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "tax_cdf"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "tax_rate"`);

    await queryRunner.query(`ALTER TABLE "business_invoice_lines" DROP CONSTRAINT "FK_business_invoice_lines_invoice"`);
    await queryRunner.query(`DROP TABLE "business_invoice_lines"`);
  }
}
