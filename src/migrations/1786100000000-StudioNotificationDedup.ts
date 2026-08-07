import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only migration — the due-soon cron's dedup guard. One new table,
 * no existing table or row is touched. No FK to `studio_tasks`: a dedup
 * row for a deleted task is inert and harmless to keep.
 */
export class StudioNotificationDedup1786100000000 implements MigrationInterface {
  name = 'StudioNotificationDedup1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "studio_notification_dedups" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"task_id" uuid NOT NULL, ` +
        `"kind" character varying NOT NULL, ` +
        `"sent_on" date NOT NULL, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_studio_notification_dedups_id" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_studio_dedup_task_kind_day" UNIQUE ("task_id", "kind", "sent_on"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_notification_dedups_task" ON "studio_notification_dedups" ("task_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_notification_dedups_task"`);
    await queryRunner.query(`DROP TABLE "studio_notification_dedups"`);
  }
}
