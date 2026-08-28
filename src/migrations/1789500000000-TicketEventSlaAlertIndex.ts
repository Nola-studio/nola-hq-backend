import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DB-enforced idempotency for the SLA breach scheduler: each of the four
 * `sla_*` TicketEventAction values may exist at most once per ticket. A
 * sweep inserts the event first and catches the unique violation as
 * "already recorded" — correct even if two sweeps overlap, no in-memory
 * state, same pattern as `StudioNotificationDedup`'s unique constraint,
 * scoped to a subset of actions via a partial index rather than a
 * dedicated table (this reuses `ticket_events` — every other action stays
 * unconstrained and can repeat freely, as before).
 */
export class TicketEventSlaAlertIndex1789500000000 implements MigrationInterface {
  name = 'TicketEventSlaAlertIndex1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ticket_events_sla_alert" ON "ticket_events" ("ticket_id", "action") ` +
        `WHERE "action" IN ('sla_response_approaching', 'sla_response_breached', 'sla_resolution_approaching', 'sla_resolution_breached')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_ticket_events_sla_alert"`);
  }
}
