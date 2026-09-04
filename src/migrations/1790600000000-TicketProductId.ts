import { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketProductId1790600000000 implements MigrationInterface {
  name = 'TicketProductId1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "product_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tickets_product" ON "tickets" ("product_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_product" ` +
        `FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Backfill from source and sourceAliases
    await queryRunner.query(
      `UPDATE "tickets" SET "product_id" = (SELECT "id" FROM "products" WHERE "code" = 'yekoli') ` +
        `WHERE "source" IN ('kelasi-owner-app', 'kelasi-web', 'yekoli', 'kelasi') ` +
        `AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
    await queryRunner.query(
      `UPDATE "tickets" SET "product_id" = (SELECT "id" FROM "products" WHERE "code" = 'butterfly') ` +
        `WHERE "source" = 'butterfly' ` +
        `AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
    await queryRunner.query(
      `UPDATE "tickets" SET "product_id" = (SELECT "id" FROM "products" WHERE "code" = 'k-river') ` +
        `WHERE "source" = 'k-river' ` +
        `AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
    await queryRunner.query(
      `UPDATE "tickets" SET "product_id" = (SELECT "id" FROM "products" WHERE "code" = 'mycvmatcher') ` +
        `WHERE "source" = 'mycvmatcher' ` +
        `AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
    await queryRunner.query(
      `UPDATE "tickets" SET "product_id" = (SELECT "id" FROM "products" WHERE "code" = 'nolaa-hq') ` +
        `WHERE "source" = 'nolaa-hq' ` +
        `AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'khi-lab')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "FK_tickets_product"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tickets_product"`);
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "product_id"`,
    );
  }
}

