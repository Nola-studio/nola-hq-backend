import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only migration — four new columns on `work_items`, absorbed from
 * the retired `studio_tasks` table now that work items are the single
 * "task" concept for both Roadmap/WorkItems and Studio's workbook
 * dashboard:
 *
 *   - `category`         (varchar, nullable — Studio's product|sales|brand|
 *      admin_legal|infra classification)
 *   - `hours_spent`       (numeric(8,2), nullable)
 *   - `progress_percent`  (integer, nullable — 0..100)
 *   - `meeting_id`        (uuid, nullable — real FK to `studio_meetings`,
 *      ON DELETE SET NULL; the meeting that created this item via Studio's
 *      decision-to-task flow, if any. `studio_meetings` stays a live table.)
 */
export class AddStudioFieldsToWorkItems1786500000000 implements MigrationInterface {
  name = 'AddStudioFieldsToWorkItems1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN "category" character varying`);
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN "hours_spent" numeric(8,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN "progress_percent" integer`,
    );
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN "meeting_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_work_items_meeting" ON "work_items" ("meeting_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD CONSTRAINT "FK_work_items_meeting" ` +
        `FOREIGN KEY ("meeting_id") REFERENCES "studio_meetings"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT "FK_work_items_meeting"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_items_meeting"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "meeting_id"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "progress_percent"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "hours_spent"`);
    await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN "category"`);
  }
}
