import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only, backward-compatible migration — the **Studio** section
 * (internal team tooling): task kanban, meetings/decisions, expenses.
 *
 * Four new tables, no existing table or row is touched:
 *
 *   1. `studio_projects`  — fixed, tiny set of workstreams (seeded by
 *      `StudioService.onModuleInit`, not by this migration).
 *   2. `studio_meetings`  — agenda + decisions (Markdown), participants.
 *   3. `studio_tasks`     — the kanban board. `project_id` has no `ON
 *      DELETE` action (projects are never deleted); `meeting_id` is
 *      `ON DELETE SET NULL` — a task outlives the meeting it was decided in.
 *   4. `studio_expenses`  — internal spend, amounts in integer cents.
 *
 * `assignee_email` / `paid_by_email` / `created_by_email` are **soft**
 * references to `team_members.email` (same convention as
 * `roadmap_initiatives.owner`): stored verbatim, no FK.
 *
 * `down` drops exactly what `up` created, in reverse dependency order.
 */
export class Studio1786000000000 implements MigrationInterface {
  name = 'Studio1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── studio_projects ─────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "studio_projects" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"name" character varying(120) NOT NULL, ` +
        `"key" character varying(12) NOT NULL, ` +
        `"status" character varying NOT NULL DEFAULT 'active', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_studio_projects_id" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_studio_projects_key" UNIQUE ("key"))`,
    );

    // ── studio_meetings ─────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "studio_meetings" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"date" date NOT NULL, ` +
        `"title" character varying(200) NOT NULL, ` +
        `"participants" text NOT NULL DEFAULT '[]', ` +
        `"agenda" text, ` +
        `"decisions" text, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_studio_meetings_id" PRIMARY KEY ("id"))`,
    );

    // ── studio_tasks ─────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "studio_tasks" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"project_id" uuid NOT NULL, ` +
        `"identifier" character varying(32) NOT NULL, ` +
        `"title" character varying(500) NOT NULL, ` +
        `"description" text, ` +
        `"status" character varying NOT NULL DEFAULT 'backlog', ` +
        `"category" character varying NOT NULL, ` +
        `"assignee_email" character varying(120), ` +
        `"due_date" date, ` +
        `"priority" character varying NOT NULL DEFAULT 'none', ` +
        `"meeting_id" uuid, ` +
        `"created_by_email" character varying(120) NOT NULL, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `"completed_at" TIMESTAMP, ` +
        `"position" integer NOT NULL DEFAULT '0', ` +
        `CONSTRAINT "PK_studio_tasks_id" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_studio_tasks_identifier" UNIQUE ("identifier"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_tasks_project" ON "studio_tasks" ("project_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_tasks_status" ON "studio_tasks" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_tasks_assignee" ON "studio_tasks" ("assignee_email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_tasks_due_date" ON "studio_tasks" ("due_date")`,
    );

    // ── studio_expenses ──────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "studio_expenses" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"description" character varying(500) NOT NULL, ` +
        `"amount_cents" integer NOT NULL, ` +
        `"currency" character varying NOT NULL, ` +
        `"category" character varying NOT NULL, ` +
        `"paid_by_email" character varying(120) NOT NULL, ` +
        `"date" date NOT NULL, ` +
        `"recurring" boolean NOT NULL DEFAULT false, ` +
        `"frequency" character varying, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_studio_expenses_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_expenses_category" ON "studio_expenses" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_expenses_date" ON "studio_expenses" ("date")`,
    );

    // ── foreign keys ─────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "studio_tasks" ADD CONSTRAINT "FK_studio_tasks_project" ` +
        `FOREIGN KEY ("project_id") REFERENCES "studio_projects"("id") ` +
        `ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_tasks" ADD CONSTRAINT "FK_studio_tasks_meeting" ` +
        `FOREIGN KEY ("meeting_id") REFERENCES "studio_meetings"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "studio_tasks" DROP CONSTRAINT "FK_studio_tasks_meeting"`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_tasks" DROP CONSTRAINT "FK_studio_tasks_project"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_studio_expenses_date"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_expenses_category"`);
    await queryRunner.query(`DROP TABLE "studio_expenses"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_studio_tasks_due_date"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_tasks_assignee"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_tasks_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_tasks_project"`);
    await queryRunner.query(`DROP TABLE "studio_tasks"`);

    await queryRunner.query(`DROP TABLE "studio_meetings"`);
    await queryRunner.query(`DROP TABLE "studio_projects"`);
  }
}
