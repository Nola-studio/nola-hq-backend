import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The producing app's own upstream due date (e.g. Vantelis IT's
 * `meta.dueAt`) — display/context only, never HQ's SLA source of truth
 * (that's `sla_policies`). Cheap to keep as a real column rather than
 * parsing it out of the ticket body every time it's wanted.
 */
export class TicketDueAt1789300000000 implements MigrationInterface {
  name = 'TicketDueAt1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" ADD COLUMN "due_at" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "due_at"`);
  }
}
