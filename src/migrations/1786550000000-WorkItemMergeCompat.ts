import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two small compatibility changes needed for `roadmap_initiatives`/
 * `work_items` to fully absorb `studio_projects`/`studio_tasks`:
 *
 *   1. `roadmap_initiatives.archived` (boolean) — Studio's project
 *      active/archived toggle has no equivalent on `RoadmapInitiativeStatus`
 *      (idea|planned|in_progress|shipped|dropped), which is a different,
 *      orthogonal axis (a shipped initiative can still be archived or not).
 *   2. `studio_notification_dedups.task_id` widens from `uuid` to
 *      `varchar` — it referenced `studio_tasks.id` (uuid); the due-soon
 *      scheduler now dedups against `work_items.id`, which is an integer
 *      serial. Stored as text so either id shape fits without another
 *      migration if the id strategy changes again. This table is a
 *      short-lived dedup log (one row per task/kind/day), safe to widen
 *      without a backfill.
 */
export class WorkItemMergeCompat1786550000000 implements MigrationInterface {
  name = 'WorkItemMergeCompat1786550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "archived" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_notification_dedups" ALTER COLUMN "task_id" TYPE character varying USING "task_id"::text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_notification_dedups" ALTER COLUMN "task_id" TYPE uuid USING "task_id"::uuid`,
    );
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "archived"`);
  }
}
