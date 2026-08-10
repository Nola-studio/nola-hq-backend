import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `studio_requests` — bugs, suggestions and standalone requests. Deliberately
 * its own table, not a `WorkItem` subtype: a request never converts into a
 * task, it just optionally references a project for context. `project_id`
 * is `ON DELETE SET NULL` — deleting a project never deletes the requests
 * filed against it.
 */
export class StudioRequests1787100000000 implements MigrationInterface {
  name = 'StudioRequests1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "studio_requests" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"title" character varying(200) NOT NULL, ` +
        `"description" text, ` +
        `"type" character varying NOT NULL DEFAULT 'demande', ` +
        `"project_id" uuid, ` +
        `"author" character varying(160) NOT NULL, ` +
        `"assignee" character varying(160), ` +
        `"status" character varying NOT NULL DEFAULT 'nouvelle', ` +
        `"priority" character varying NOT NULL DEFAULT 'P2', ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `"closed_at" TIMESTAMP, ` +
        `CONSTRAINT "PK_studio_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_studio_requests_project" ON "studio_requests" ("project_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_studio_requests_status" ON "studio_requests" ("status")`);
    await queryRunner.query(
      `ALTER TABLE "studio_requests" ADD CONSTRAINT "FK_studio_requests_project" ` +
        `FOREIGN KEY ("project_id") REFERENCES "roadmap_initiatives"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "studio_requests" DROP CONSTRAINT "FK_studio_requests_project"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_requests_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_requests_project"`);
    await queryRunner.query(`DROP TABLE "studio_requests"`);
  }
}
