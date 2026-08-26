import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a business unit pick which PDF color palette (`PDF_THEMES` in
 * `business-pdf.service.ts`) its quotes/invoices/receipts render in.
 * Nullable, like `tagline`/`footer_line` — null resolves in code to
 * `'indigo'` (khi-lab's own palette), the same "unset falls back to the
 * system default brand" precedent already established by
 * `DEFAULT_BUSINESS_UNIT_CODE = 'khi-lab'`
 * (`business-unit-resolver.service.ts`), rather than introducing a second,
 * different default concept.
 *
 * `emerald` is a valid value in the CHECK constraint even though no HQ
 * business unit is expected to use it today — it's Yekoli's tenant-receipt
 * palette (a different repo/product), kept here only because it's a real
 * `PDF_THEMES` key and the PDF verification pass renders all four.
 *
 * Postgres-only, like every other migration in this repo: SQLite dev keeps
 * `synchronize: true` and never runs migrations (see src/data-source.ts) —
 * the entity column is the source of truth there.
 */
export class BusinessUnitTheme1788500000000 implements MigrationInterface {
  name = 'BusinessUnitTheme1788500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_units" ADD "theme" character varying(20)`);
    await queryRunner.query(
      `ALTER TABLE "business_units" ADD CONSTRAINT "CHK_business_units_theme" ` +
        `CHECK ("theme" IS NULL OR "theme" IN ('emerald', 'navy', 'indigo', 'slate'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_units" DROP CONSTRAINT "CHK_business_units_theme"`);
    await queryRunner.query(`ALTER TABLE "business_units" DROP COLUMN "theme"`);
  }
}
