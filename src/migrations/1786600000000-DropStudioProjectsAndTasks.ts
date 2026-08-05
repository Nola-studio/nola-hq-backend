import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops `studio_tasks`/`studio_projects` — `roadmap_initiatives`/
 * `work_items` are the unified project/task backbone as of this point in
 * the migration chain (see `1786400000000-AddStudioFieldsToRoadmapInitiatives`,
 * `1786500000000-AddStudioFieldsToWorkItems`, `1786550000000-WorkItemMergeCompat`).
 * No code references `StudioProject`/`StudioTask` past this commit.
 *
 * On a from-scratch install the earlier Studio migrations still create
 * these tables and this one drops them again — intentional, not rewritten,
 * so the migration history stays append-only.
 *
 * `studio_domains.linked_project_id` was always FK-less (a soft reference),
 * so nothing else needs to change here for it to now mean
 * `roadmap_initiatives.id` instead.
 *
 * `down` recreates both tables in the shape the retired
 * `1786200000000-StudioProjectFields`/`1786300000000-StudioWorkbook`
 * migrations last left them in — a lossy rollback (no row data), same as
 * every other `DROP TABLE` in this codebase's `down()`s.
 */
export class DropStudioProjectsAndTasks1786600000000 implements MigrationInterface {
  name = 'DropStudioProjectsAndTasks1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "studio_tasks"`);
    await queryRunner.query(`DROP TABLE "studio_projects"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "studio_projects" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"name" character varying(120) NOT NULL, ` +
        `"key" character varying(12) NOT NULL, ` +
        `"description" text, ` +
        `"status" character varying NOT NULL DEFAULT 'active', ` +
        `"color" character varying(7) NOT NULL DEFAULT '#94A3B8', ` +
        `"owner_email" character varying(120), ` +
        `"type" character varying, ` +
        `"priority" character varying, ` +
        `"health_status" character varying, ` +
        `"budget" numeric(12,2), ` +
        `"cost" numeric(12,2), ` +
        `"start_date" date, ` +
        `"due_date" date, ` +
        `"lead_assignee_email" character varying(120), ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "UQ_studio_projects_key" UNIQUE ("key"), ` +
        `CONSTRAINT "PK_studio_projects_id" PRIMARY KEY ("id"))`,
    );
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
        `"hours_spent" numeric(8,2), ` +
        `"progress_percent" integer, ` +
        `CONSTRAINT "UQ_studio_tasks_identifier" UNIQUE ("identifier"), ` +
        `CONSTRAINT "PK_studio_tasks_id" PRIMARY KEY ("id"))`,
    );
  }
}
