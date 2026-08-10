import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Splits `roadmap_initiatives` into two screens without splitting the
 * table: `scope` distinguishes durable products (`'project'` — Roadmap's
 * `/projects` screen) from bounded work (`'initiative'` — `/roadmap`'s own
 * board/timeline/objectives).
 *
 * Backfill matches by title against the five known durable products
 * (`scripts/seed/seed-studio.ts`'s workbook import) — everything else
 * defaults to `'initiative'`, the safer assumption since bounded work is
 * the common case. Any durable product renamed or added since that seed
 * ran will need manual reclassification via `PATCH
 * /roadmap/initiatives/:id/scope` (`hq:owner`) after this runs.
 */
export class AddScopeToRoadmapInitiatives1787200000000 implements MigrationInterface {
  name = 'AddScopeToRoadmapInitiatives1787200000000';

  private readonly durableProductTitles = ['Nolaa HQ', 'K-River', 'Yekoli', 'Butterfly', 'Mycvmatcher'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD COLUMN "scope" character varying NOT NULL DEFAULT 'initiative'`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_roadmap_initiatives_scope" ON "roadmap_initiatives" ("scope")`);
    await queryRunner.query(
      `UPDATE "roadmap_initiatives" SET "scope" = 'project' WHERE "title" = ANY($1)`,
      [this.durableProductTitles],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_initiatives_scope"`);
    await queryRunner.query(`ALTER TABLE "roadmap_initiatives" DROP COLUMN "scope"`);
  }
}
