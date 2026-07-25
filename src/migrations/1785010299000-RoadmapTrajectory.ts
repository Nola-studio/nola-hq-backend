import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only, backward-compatible migration — **measurable** roadmap:
 * key results, planned trajectory and staged (cascading) objectives.
 *
 *   1. `roadmap_objectives` gains two nullable columns:
 *      - `parent_id` → self-FK, `ON DELETE SET NULL`: dropping an annual
 *        objective detaches the quarterly ones, it never deletes them
 *        (same posture as `roadmap_initiatives.objective_id`);
 *      - `year` — an objective with a `year` and no `quarter` is the annual
 *        one. The horizon stays *derivable*: no enum to keep in sync.
 *      Both are nullable with no default, so every existing row keeps
 *      behaving exactly as before.
 *   2. `roadmap_key_results`      — how an objective is measured
 *      (`baseline` → `target`, `direction`). `objective_id` is
 *      `ON DELETE CASCADE`: a measure has no meaning without its goal.
 *      `metric_key` is a **soft** reference to `METRIC_DEFS`
 *      (`src/analytics/snapshot.metrics.ts`) — the metric registry is code,
 *      not a table, so a FK is impossible; the value is validated at the DTO
 *      level against `METRIC_KEYS`.
 *   3. `roadmap_trajectory_points` — the planned curve of a key result, one
 *      point per (key result, date) so re-planning a date updates in place.
 *      `ON DELETE CASCADE` for the same reason.
 *
 * `down` drops exactly what `up` created, in reverse dependency order,
 * including the two objective columns — the rollback is lossless for every
 * pre-existing column and row.
 */
export class RoadmapTrajectory1785010299000 implements MigrationInterface {
  name = 'RoadmapTrajectory1785010299000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── staged objectives ─────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "roadmap_objectives" ADD "parent_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_objectives" ADD "year" character varying(4)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_objectives_parent" ON "roadmap_objectives" ("parent_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_objectives" ADD CONSTRAINT "FK_roadmap_objectives_parent" ` +
        `FOREIGN KEY ("parent_id") REFERENCES "roadmap_objectives"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // ── roadmap_key_results ───────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "roadmap_key_results" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"objective_id" uuid NOT NULL, ` +
        `"label" character varying(200) NOT NULL, ` +
        `"metric_key" character varying(64), ` +
        `"unit" character varying NOT NULL, ` +
        `"baseline" real NOT NULL, ` +
        `"target" real NOT NULL, ` +
        `"direction" character varying NOT NULL, ` +
        `"position" integer NOT NULL DEFAULT '0', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_roadmap_key_results_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_key_results_objective" ON "roadmap_key_results" ("objective_id")`,
    );

    // ── roadmap_trajectory_points ─────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "roadmap_trajectory_points" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"key_result_id" uuid NOT NULL, ` +
        `"date" date NOT NULL, ` +
        `"target_value" real, ` +
        `"actual_value" real, ` +
        `"note" text, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_roadmap_trajectory_points_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_trajectory_points_key_result" ON "roadmap_trajectory_points" ("key_result_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_roadmap_trajectory_points_key_result_date" ` +
        `ON "roadmap_trajectory_points" ("key_result_id", "date")`,
    );

    // ── foreign keys ──────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "roadmap_key_results" ADD CONSTRAINT "FK_roadmap_key_results_objective" ` +
        `FOREIGN KEY ("objective_id") REFERENCES "roadmap_objectives"("id") ` +
        `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_trajectory_points" ADD CONSTRAINT "FK_roadmap_trajectory_points_key_result" ` +
        `FOREIGN KEY ("key_result_id") REFERENCES "roadmap_key_results"("id") ` +
        `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roadmap_trajectory_points" DROP CONSTRAINT "FK_roadmap_trajectory_points_key_result"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_key_results" DROP CONSTRAINT "FK_roadmap_key_results_objective"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_roadmap_trajectory_points_key_result_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_roadmap_trajectory_points_key_result"`,
    );
    await queryRunner.query(`DROP TABLE "roadmap_trajectory_points"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_key_results_objective"`);
    await queryRunner.query(`DROP TABLE "roadmap_key_results"`);

    await queryRunner.query(
      `ALTER TABLE "roadmap_objectives" DROP CONSTRAINT "FK_roadmap_objectives_parent"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_objectives_parent"`);
    await queryRunner.query(`ALTER TABLE "roadmap_objectives" DROP COLUMN "year"`);
    await queryRunner.query(`ALTER TABLE "roadmap_objectives" DROP COLUMN "parent_id"`);
  }
}
