import { MigrationInterface, QueryRunner } from 'typeorm';

/** Comments, checklist and ticket-local history for internal work items. */
export class InternalWorkCollaboration1785888100000 implements MigrationInterface {
  name = 'InternalWorkCollaboration1785888100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "work_item_comments" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "work_item_id" integer NOT NULL, ` +
        `"author" character varying(160) NOT NULL, "body" text NOT NULL, ` +
        `"created_at" TIMESTAMP NOT NULL, CONSTRAINT "PK_work_item_comments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_work_item_comments_item" ON "work_item_comments" ("work_item_id")`);

    await queryRunner.query(
      `CREATE TABLE "work_item_subtasks" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "work_item_id" integer NOT NULL, ` +
        `"title" character varying(240) NOT NULL, "done" boolean NOT NULL DEFAULT false, ` +
        `"position" integer NOT NULL DEFAULT '0', "assignee" character varying(160), ` +
        `"created_at" TIMESTAMP NOT NULL, "updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_work_item_subtasks" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_work_item_subtasks_item" ON "work_item_subtasks" ("work_item_id")`);

    await queryRunner.query(
      `CREATE TABLE "work_item_events" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "work_item_id" integer NOT NULL, ` +
        `"actor" character varying(160) NOT NULL, "action" character varying(40) NOT NULL, ` +
        `"meta" text NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_work_item_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_work_item_events_item" ON "work_item_events" ("work_item_id")`);

    await queryRunner.query(`ALTER TABLE "work_item_comments" ADD CONSTRAINT "FK_work_item_comments_item" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "work_item_subtasks" ADD CONSTRAINT "FK_work_item_subtasks_item" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "work_item_events" ADD CONSTRAINT "FK_work_item_events_item" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "work_item_events" DROP CONSTRAINT "FK_work_item_events_item"`);
    await queryRunner.query(`ALTER TABLE "work_item_subtasks" DROP CONSTRAINT "FK_work_item_subtasks_item"`);
    await queryRunner.query(`ALTER TABLE "work_item_comments" DROP CONSTRAINT "FK_work_item_comments_item"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_item_events_item"`);
    await queryRunner.query(`DROP TABLE "work_item_events"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_item_subtasks_item"`);
    await queryRunner.query(`DROP TABLE "work_item_subtasks"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_work_item_comments_item"`);
    await queryRunner.query(`DROP TABLE "work_item_comments"`);
  }
}
