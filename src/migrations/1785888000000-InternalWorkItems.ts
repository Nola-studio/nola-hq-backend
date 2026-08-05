import { MigrationInterface, QueryRunner } from 'typeorm';

/** Expand-only foundation for Nola Studio's internal project work. */
export class InternalWorkItems1785888000000 implements MigrationInterface {
  name = 'InternalWorkItems1785888000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "work_items" (` +
        `"id" SERIAL NOT NULL, ` +
        `"reference" character varying(32), ` +
        `"project_id" uuid, ` +
        `"title" character varying(200) NOT NULL, ` +
        `"description" text, ` +
        `"type" character varying NOT NULL DEFAULT 'task', ` +
        `"status" character varying NOT NULL DEFAULT 'backlog', ` +
        `"priority" character varying NOT NULL DEFAULT 'P2', ` +
        `"reporter" character varying(160) NOT NULL, ` +
        `"assignee" character varying(160), ` +
        `"due_date" date, ` +
        `"blocked_reason" text, ` +
        `"position" integer NOT NULL DEFAULT '0', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `"closed_at" TIMESTAMP, ` +
        `CONSTRAINT "UQ_work_items_reference" UNIQUE ("reference"), ` +
        `CONSTRAINT "PK_work_items_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_work_items_project" ON "work_items" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_work_items_status" ON "work_items" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_work_items_priority" ON "work_items" ("priority")`);
    await queryRunner.query(`CREATE INDEX "IDX_work_items_assignee" ON "work_items" ("assignee")`);
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD CONSTRAINT "FK_work_items_project" ` +
        `FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_items" DROP CONSTRAINT "FK_work_items_project"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_items_assignee"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_items_priority"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_items_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_items_project"`);
    await queryRunner.query(`DROP TABLE "work_items"`);
  }
}
