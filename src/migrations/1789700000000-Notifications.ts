import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the derived-count notification model (nola-hq#65) with real,
 * per-recipient rows. One row per (recipient, triggering event) — a
 * ticket-created event fans out to a brand's team, an assignment fans out
 * to exactly one person; `ticket_events` has no recipient concept and
 * can't represent either shape.
 */
export class Notifications1789700000000 implements MigrationInterface {
  name = 'Notifications1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"recipient_id" character varying NOT NULL, ` +
        `"kind" character varying NOT NULL, ` +
        `"ticket_id" integer, ` +
        `"title" character varying(200) NOT NULL, ` +
        `"body" character varying(300), ` +
        `"url" character varying, ` +
        `"read_at" TIMESTAMP, ` +
        `"cleared_at" TIMESTAMP, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_notifications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_notifications_recipient" ON "notifications" ("recipient_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_ticket" ON "notifications" ("ticket_id")`);
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_ticket" ` +
        `FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_ticket"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_ticket"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_recipient"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
