import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an invoice/quote/contract carry its own brand identity (name,
 * tagline, footer line) instead of always rendering the hardcoded
 * `LEGAL_ENTITY` constant — the legal entity stays the contracting party,
 * the business unit becomes the letterhead. See `business-pdf.service.ts`.
 *
 * `business_unit_id` is snapshotted at issuance, not derived live through
 * `project_id` — an issued document is a historical record, and
 * reassigning a project's business unit later must not reprint old
 * documents under a new brand. Backfilled from the project where present
 * (invoices always have one; quotes/contracts may not), else `khi-lab`,
 * resolved by `code`, never a hardcoded id — same convention as
 * `CompanyBrandSchema1788300000000`.
 *
 * `business_number_sequences` is untouched: numbering stays one unbroken
 * sequence per legal entity, brand is a column, never a number prefix.
 *
 * Postgres-only, like every other migration in this repo: SQLite dev keeps
 * `synchronize: true` and never runs migrations (see src/data-source.ts).
 */
export class InvoiceBrandFields1788400000000 implements MigrationInterface {
  name = 'InvoiceBrandFields1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // business_units: per-brand PDF display strings, nullable — no override falls back to LEGAL_ENTITY.
    await queryRunner.query(`ALTER TABLE "business_units" ADD "tagline" character varying(200)`);
    await queryRunner.query(`ALTER TABLE "business_units" ADD "footer_line" character varying(200)`);
    await queryRunner.query(
      `UPDATE "business_units" SET "tagline" = 'Studio de produits numériques', ` +
        `"footer_line" = 'Khi-Lab | Merci pour votre confiance' WHERE "code" = 'khi-lab'`,
    );
    await queryRunner.query(
      `UPDATE "business_units" SET "tagline" = 'Services informatiques gérés', ` +
        `"footer_line" = 'Vantelis IT | Merci pour votre confiance' WHERE "code" = 'vantelis-it'`,
    );

    // business_invoices: add nullable, backfill from project where present, else khi-lab, then enforce NOT NULL.
    await queryRunner.query(`ALTER TABLE "business_invoices" ADD "business_unit_id" uuid`);
    await queryRunner.query(
      `UPDATE "business_invoices" SET "business_unit_id" = ` +
        `(SELECT "business_unit_id" FROM "roadmap_initiatives" WHERE "id" = "business_invoices"."project_id")`,
    );
    await queryRunner.query(
      `UPDATE "business_invoices" SET "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab') ` +
        `WHERE "business_unit_id" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "business_invoices" ALTER COLUMN "business_unit_id" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_business_invoices_business_unit" ON "business_invoices" ("business_unit_id")`);
    await queryRunner.query(
      `ALTER TABLE "business_invoices" ADD CONSTRAINT "FK_business_invoices_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // business_quotes: same sequence — project_id is nullable here, so the khi-lab fallback is a real path.
    await queryRunner.query(`ALTER TABLE "business_quotes" ADD "business_unit_id" uuid`);
    await queryRunner.query(
      `UPDATE "business_quotes" SET "business_unit_id" = ` +
        `(SELECT "business_unit_id" FROM "roadmap_initiatives" WHERE "id" = "business_quotes"."project_id")`,
    );
    await queryRunner.query(
      `UPDATE "business_quotes" SET "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab') ` +
        `WHERE "business_unit_id" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "business_quotes" ALTER COLUMN "business_unit_id" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_business_quotes_business_unit" ON "business_quotes" ("business_unit_id")`);
    await queryRunner.query(
      `ALTER TABLE "business_quotes" ADD CONSTRAINT "FK_business_quotes_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    // business_contracts: same sequence — project_id is nullable here too.
    await queryRunner.query(`ALTER TABLE "business_contracts" ADD "business_unit_id" uuid`);
    await queryRunner.query(
      `UPDATE "business_contracts" SET "business_unit_id" = ` +
        `(SELECT "business_unit_id" FROM "roadmap_initiatives" WHERE "id" = "business_contracts"."project_id")`,
    );
    await queryRunner.query(
      `UPDATE "business_contracts" SET "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab') ` +
        `WHERE "business_unit_id" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "business_contracts" ALTER COLUMN "business_unit_id" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_business_contracts_business_unit" ON "business_contracts" ("business_unit_id")`);
    await queryRunner.query(
      `ALTER TABLE "business_contracts" ADD CONSTRAINT "FK_business_contracts_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP CONSTRAINT "FK_business_contracts_business_unit"`);
    await queryRunner.query(`DROP INDEX "IDX_business_contracts_business_unit"`);
    await queryRunner.query(`ALTER TABLE "business_contracts" DROP COLUMN "business_unit_id"`);

    await queryRunner.query(`ALTER TABLE "business_quotes" DROP CONSTRAINT "FK_business_quotes_business_unit"`);
    await queryRunner.query(`DROP INDEX "IDX_business_quotes_business_unit"`);
    await queryRunner.query(`ALTER TABLE "business_quotes" DROP COLUMN "business_unit_id"`);

    await queryRunner.query(`ALTER TABLE "business_invoices" DROP CONSTRAINT "FK_business_invoices_business_unit"`);
    await queryRunner.query(`DROP INDEX "IDX_business_invoices_business_unit"`);
    await queryRunner.query(`ALTER TABLE "business_invoices" DROP COLUMN "business_unit_id"`);

    await queryRunner.query(`ALTER TABLE "business_units" DROP COLUMN "footer_line"`);
    await queryRunner.query(`ALTER TABLE "business_units" DROP COLUMN "tagline"`);
  }
}
