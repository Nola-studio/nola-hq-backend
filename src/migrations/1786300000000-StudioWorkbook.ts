import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only migration for the Studio → Project Management Dashboard
 * workbook import:
 *
 *   - `studio_projects`: 8 new nullable columns (`type`, `priority`,
 *     `health_status`, `budget`, `cost`, `start_date`, `due_date`,
 *     `lead_assignee_email`). All nullable — the source workbook itself
 *     only has these values for 1 of 5 real projects, and existing rows
 *     (e.g. the retired YEK/NOLA/STU seed) have none of them.
 *     `health_status` is deliberately a *new* column, not a repurposing of
 *     `status` — `status` stays the active/archived lifecycle flag used by
 *     `StudioService.archiveProject`.
 *   - `studio_tasks`: 2 new nullable columns (`hours_spent`,
 *     `progress_percent`).
 *   - `studio_expenses`: 4 new nullable columns (`status`, `workspace`,
 *     `billing_email`, `payment_method`) to cover the Billing sheet.
 *   - Two new tables: `studio_domains`, `studio_recurring`.
 *
 * No existing row is touched; nothing is dropped or renamed.
 */
export class StudioWorkbook1786300000000 implements MigrationInterface {
  name = 'StudioWorkbook1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── studio_projects ─────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "type" character varying`);
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "priority" character varying`);
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "health_status" character varying`);
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "budget" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "cost" numeric(12,2)`);
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "start_date" date`);
    await queryRunner.query(`ALTER TABLE "studio_projects" ADD COLUMN "due_date" date`);
    await queryRunner.query(
      `ALTER TABLE "studio_projects" ADD COLUMN "lead_assignee_email" character varying(120)`,
    );

    // ── studio_tasks ─────────────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "studio_tasks" ADD COLUMN "hours_spent" numeric(8,2)`);
    await queryRunner.query(`ALTER TABLE "studio_tasks" ADD COLUMN "progress_percent" integer`);

    // ── studio_expenses ──────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" ADD COLUMN "status" character varying DEFAULT 'paid'`,
    );
    await queryRunner.query(`ALTER TABLE "studio_expenses" ADD COLUMN "workspace" character varying(200)`);
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" ADD COLUMN "billing_email" character varying(160)`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_expenses" ADD COLUMN "payment_method" character varying(120)`,
    );

    // ── studio_domains ───────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "studio_domains" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"domain" character varying(255) NOT NULL, ` +
        `"purchase_date" date, ` +
        `"renewal_date" date, ` +
        `"registrar" character varying(120), ` +
        `"platform" character varying(120), ` +
        `"purpose" text, ` +
        `"price" numeric(12,2), ` +
        `"auto_renew" boolean NOT NULL DEFAULT true, ` +
        `"status" character varying(120), ` +
        `"linked_project_id" uuid, ` +
        `"notes" text, ` +
        `"workspace" character varying(200), ` +
        `"billing_email" character varying(160), ` +
        `"paid_by_email" character varying(120), ` +
        `"payment_method" character varying(120), ` +
        `"billing_cycle" character varying(40), ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_studio_domains_id" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_studio_domains_domain" UNIQUE ("domain"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_domains_renewal_date" ON "studio_domains" ("renewal_date")`,
    );

    // ── studio_recurring ─────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "studio_recurring" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"service" character varying(200) NOT NULL, ` +
        `"purpose" text, ` +
        `"amount" numeric(12,2) NOT NULL, ` +
        `"cycle" character varying(60) NOT NULL, ` +
        `"charge_day" character varying(60), ` +
        `"paid_by_email" character varying(120), ` +
        `"billing_account" character varying(200), ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_studio_recurring_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "studio_recurring"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_studio_domains_renewal_date"`);
    await queryRunner.query(`DROP TABLE "studio_domains"`);

    await queryRunner.query(`ALTER TABLE "studio_expenses" DROP COLUMN "payment_method"`);
    await queryRunner.query(`ALTER TABLE "studio_expenses" DROP COLUMN "billing_email"`);
    await queryRunner.query(`ALTER TABLE "studio_expenses" DROP COLUMN "workspace"`);
    await queryRunner.query(`ALTER TABLE "studio_expenses" DROP COLUMN "status"`);

    await queryRunner.query(`ALTER TABLE "studio_tasks" DROP COLUMN "progress_percent"`);
    await queryRunner.query(`ALTER TABLE "studio_tasks" DROP COLUMN "hours_spent"`);

    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "lead_assignee_email"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "due_date"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "start_date"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "cost"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "budget"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "health_status"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "priority"`);
    await queryRunner.query(`ALTER TABLE "studio_projects" DROP COLUMN "type"`);
  }
}
