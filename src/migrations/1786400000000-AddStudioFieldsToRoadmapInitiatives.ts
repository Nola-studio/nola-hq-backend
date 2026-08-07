import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only migration — four new columns on `roadmap_initiatives`,
 * absorbed from the retired `studio_projects` table now that Roadmap
 * initiatives are the single "project" concept for both the roadmap and
 * Studio's workbook dashboard:
 *
 *   - `color`         (varchar(7), NOT NULL — same default as Studio used)
 *   - `health_status`  (varchar, nullable — on_track|on_hold|behind|completed)
 *   - `type`           (varchar, nullable — Studio's operational project type,
 *      distinct from the existing `kind` which stays dev's strategic
 *      product|tech|gtm|ops classification)
 *   - `key_prefix`     (varchar(12), nullable, unique when set — the
 *      immutable, user-typed prefix Studio tasks used to build
 *      `{key}-{n}` identifiers, e.g. `YEK`. Deliberately NOT a reuse of
 *      `app_id`: that column is a soft reference into the in-memory apps
 *      registry that `WorkItemsService.projectPrefix()` already derives
 *      task-reference prefixes from — a different concept.
 */
export class AddStudioFieldsToRoadmapInitiatives1786400000000 implements MigrationInterface {
  name = 'AddStudioFieldsToRoadmapInitiatives1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "color" character varying(7) NOT NULL DEFAULT '#94A3B8'`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "health_status" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "type" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "key_prefix" character varying(12)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_roadmap_initiatives_key_prefix" ON "roadmap_initiatives" ("key_prefix") WHERE "key_prefix" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_roadmap_initiatives_key_prefix"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "key_prefix"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "health_status"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "color"`);
  }
}
