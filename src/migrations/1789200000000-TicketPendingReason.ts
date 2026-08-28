import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `pending` was one undifferentiated wait state — no way to tell "waiting
 * on the client" from "waiting on a vendor" from "waiting on us
 * internally". The SLA clock should only pause for the first: it costs one
 * nullable column to say so explicitly instead of assuming every pending
 * ticket is blocked on the client. Null (every existing pending ticket,
 * and any future one that doesn't specify) behaves as 'client' — see
 * TicketsService.
 */
export class TicketPendingReason1789200000000 implements MigrationInterface {
  name = 'TicketPendingReason1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" ADD COLUMN "pending_reason" character varying(16)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tickets" DROP COLUMN "pending_reason"`);
  }
}
