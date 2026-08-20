import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atomic, year-scoped number sequences shared by quotes/invoices/receipts/
 * contracts. Replaces the old `${prefix}-${YYYYMMDD}-${random6}` generator
 * (`makeNumber()` in business.service.ts / business-operations.service.ts),
 * whose uniqueness was only enforced by a `findOne` check-then-insert — a
 * race under concurrent creates. Existing rows keep their old-format
 * numbers; this table starts every (prefix, year) counter at 0.
 */
export class BusinessNumberSequences1788000000000 implements MigrationInterface {
  name = 'BusinessNumberSequences1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "business_number_sequences" (` +
        `"prefix" character varying(8) NOT NULL, ` +
        `"year" integer NOT NULL, ` +
        `"last_value" integer NOT NULL DEFAULT '0', ` +
        `CONSTRAINT "PK_business_number_sequences" PRIMARY KEY ("prefix", "year"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "business_number_sequences"`);
  }
}
