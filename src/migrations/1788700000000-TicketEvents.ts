import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only: a new table, nothing existing is touched.
 *
 * `ticket_events` — audit trail for `tickets`, same shape as
 * `work_item_events` except `from_status`/`to_status`/`reason` are
 * first-class columns rather than buried in `meta` (that's the one thing
 * `work_item_events` gets wrong — its `moved` event's `{ from, to }`
 * can't be filtered or indexed on). `meta` still exists for whatever
 * doesn't warrant its own column.
 *
 * `down` drops exactly what `up` created.
 */
export class TicketEvents1788700000000 implements MigrationInterface {
  name = 'TicketEvents1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "ticket_events" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ticket_id" integer NOT NULL, ` +
        `"actor" character varying(160) NOT NULL, "action" character varying(40) NOT NULL, ` +
        `"from_status" character varying(24), "to_status" character varying(24), ` +
        `"reason" character varying(240), ` +
        `"meta" text NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_ticket_events" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ticket_events_ticket" ON "ticket_events" ("ticket_id")`);
    await queryRunner.query(
      `ALTER TABLE "ticket_events" ADD CONSTRAINT "FK_ticket_events_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ticket_events" DROP CONSTRAINT "FK_ticket_events_ticket"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_events_ticket"`);
    await queryRunner.query(`DROP TABLE "ticket_events"`);
  }
}
