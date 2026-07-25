import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only, backward-compatible migration — the studio **roadmap**.
 *
 * Three new tables, no existing table or row is touched:
 *
 *   1. `roadmap_objectives`  — quarterly strategic goals.
 *   2. `roadmap_initiatives` — projects/workstreams serving an objective.
 *      `objective_id` is `ON DELETE SET NULL`: deleting a strategic goal
 *      detaches the work planned under it, it never deletes it.
 *   3. `roadmap_milestones`  — execution checkpoints inside an initiative.
 *      `initiative_id` is `ON DELETE CASCADE`: a checkpoint has no meaning
 *      without its initiative.
 *
 * `app_id` / `tenant_id` on initiatives are **soft** references and carry no
 * FK on purpose: the apps registry is an in-memory JetStream projection (no
 * table at all, cf. `AppsService`) and the canonical tenant record is owned
 * by nola-billing.
 *
 * `down` drops exactly what `up` created, in reverse dependency order — the
 * rollback is lossless for every pre-existing table.
 */
export class Roadmap1782600000000 implements MigrationInterface {
  name = 'Roadmap1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── roadmap_objectives ────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "roadmap_objectives" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"title" character varying(200) NOT NULL, ` +
        `"description" text, ` +
        `"quarter" character varying(7), ` +
        `"status" character varying NOT NULL DEFAULT 'draft', ` +
        `"owner" character varying(120), ` +
        `"progress" integer NOT NULL DEFAULT '0', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_roadmap_objectives_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_objectives_quarter" ON "roadmap_objectives" ("quarter")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_objectives_status" ON "roadmap_objectives" ("status")`,
    );

    // ── roadmap_initiatives ───────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "roadmap_initiatives" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"objective_id" uuid, ` +
        `"title" character varying(200) NOT NULL, ` +
        `"summary" text, ` +
        `"kind" character varying NOT NULL DEFAULT 'product', ` +
        `"status" character varying NOT NULL DEFAULT 'idea', ` +
        `"priority" character varying NOT NULL DEFAULT 'P2', ` +
        `"quarter" character varying(7), ` +
        `"start_date" date, ` +
        `"target_date" date, ` +
        `"owner" character varying(120), ` +
        `"app_id" character varying(64), ` +
        `"tenant_id" character varying, ` +
        `"progress" integer NOT NULL DEFAULT '0', ` +
        `"position" integer NOT NULL DEFAULT '0', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_roadmap_initiatives_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_initiatives_objective" ON "roadmap_initiatives" ("objective_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_initiatives_status" ON "roadmap_initiatives" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_initiatives_quarter" ON "roadmap_initiatives" ("quarter")`,
    );

    // ── roadmap_milestones ────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "roadmap_milestones" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"initiative_id" uuid NOT NULL, ` +
        `"title" character varying(200) NOT NULL, ` +
        `"due_date" date, ` +
        `"done" boolean NOT NULL DEFAULT false, ` +
        `"position" integer NOT NULL DEFAULT '0', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_roadmap_milestones_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_roadmap_milestones_initiative" ON "roadmap_milestones" ("initiative_id")`,
    );

    // ── foreign keys ──────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" ADD CONSTRAINT "FK_roadmap_initiatives_objective" ` +
        `FOREIGN KEY ("objective_id") REFERENCES "roadmap_objectives"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_milestones" ADD CONSTRAINT "FK_roadmap_milestones_initiative" ` +
        `FOREIGN KEY ("initiative_id") REFERENCES "roadmap_initiatives"("id") ` +
        `ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roadmap_milestones" DROP CONSTRAINT "FK_roadmap_milestones_initiative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roadmap_initiatives" DROP CONSTRAINT "FK_roadmap_initiatives_objective"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_milestones_initiative"`);
    await queryRunner.query(`DROP TABLE "roadmap_milestones"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_initiatives_quarter"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_initiatives_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_initiatives_objective"`);
    await queryRunner.query(`DROP TABLE "roadmap_initiatives"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_objectives_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_roadmap_objectives_quarter"`);
    await queryRunner.query(`DROP TABLE "roadmap_objectives"`);
  }
}
