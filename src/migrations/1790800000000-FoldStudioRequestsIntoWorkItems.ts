import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REQ-01 — retires `studio_requests` by folding it into `work_items`.
 *
 * A request was a `WorkItem` with a parallel lifecycle and none of the
 * machinery: no comments, no attachments, no history, no dependencies, no
 * sprint, no readable reference, no Kanban. Filing one and getting it into the
 * backlog took four operator actions and nine fields, two of which the request
 * already held. Folding removes the second object rather than improving the
 * ritual around it.
 *
 * Row-by-row translation:
 *
 *  - `acceptee` — already converted, `linked_work_item_id` points at the real
 *    ticket. The ticket is *back-filled* with the request's provenance, never
 *    duplicated.
 *  - `nouvelle`, `en_revue` — live needs; become work items in `todo`, because
 *    a human's sentence is a backlog entry, not something to approve.
 *  - `rejetee`, `fermee` — become `closed` work items, so the record of what
 *    was asked and declined survives the table it lived in.
 *
 * Types map `bug → bug`, `suggestion → feature`, `demande → task`; priorities
 * are already `P0`-`P3` on both sides.
 *
 * `down()` recreates the table empty. Lossy, like every other `DROP TABLE`
 * rollback in this codebase — the rows live on in `work_items`, carrying
 * `source_kind = 'request'` and their original id in `source_key`.
 */
export class FoldStudioRequestsIntoWorkItems1790800000000 implements MigrationInterface {
  name = 'FoldStudioRequestsIntoWorkItems1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Converted requests: annotate the ticket they produced.
    await queryRunner.query(
      `UPDATE "work_items" w SET
         "source_kind" = 'request',
         "source_key" = r."id"::text,
         "source_author" = r."author"
       FROM "studio_requests" r
       WHERE r."linked_work_item_id" = w."id"
         AND w."source_kind" = 'manual'`,
    );

    // 2. Everything never converted becomes a work item in its own right.
    await queryRunner.query(
      `INSERT INTO "work_items" (
         "project_id", "title", "description", "type", "status", "priority",
         "reporter", "assignee", "position", "estimate_points",
         "source_kind", "source_key", "source_author",
         "created_at", "updated_at", "closed_at")
       SELECT
         r."project_id",
         left(r."title", 200),
         r."description",
         CASE r."type" WHEN 'bug' THEN 'bug' WHEN 'suggestion' THEN 'feature' ELSE 'task' END,
         CASE WHEN r."status" IN ('rejetee', 'fermee') THEN 'closed' ELSE 'todo' END,
         r."priority",
         r."author",
         r."assignee",
         0,
         0,
         'request',
         r."id"::text,
         r."author",
         r."created_at",
         r."updated_at",
         CASE WHEN r."status" IN ('rejetee', 'fermee') THEN COALESCE(r."closed_at", r."updated_at") END
       FROM "studio_requests" r
       WHERE r."linked_work_item_id" IS NULL`,
    );

    await queryRunner.query(`DROP TABLE "studio_requests"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "studio_requests" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"title" character varying(200) NOT NULL, ` +
        `"description" text, ` +
        `"type" character varying NOT NULL DEFAULT 'demande', ` +
        `"project_id" uuid, ` +
        `"author" character varying(160) NOT NULL, ` +
        `"assignee" character varying(160), ` +
        `"status" character varying NOT NULL DEFAULT 'nouvelle', ` +
        `"priority" character varying NOT NULL DEFAULT 'P2', ` +
        `"linked_work_item_id" integer, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"closed_at" TIMESTAMP, ` +
        `CONSTRAINT "PK_studio_requests" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_requests_status" ON "studio_requests" ("status")`,
    );
  }
}
