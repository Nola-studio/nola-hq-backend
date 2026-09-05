import { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketWorkItemId1790800000000 implements MigrationInterface {
  name = 'TicketWorkItemId1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "work_item_id" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tickets_work_item_id" ON "tickets" ("work_item_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_work_item_id" ` +
        `FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "FK_tickets_work_item_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_tickets_work_item_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "work_item_id"`,
    );
  }
}
