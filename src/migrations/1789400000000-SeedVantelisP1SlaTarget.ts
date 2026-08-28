import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Not a guess: 15 minutes is what the Vantelis IT portal already promises
 * its own clients (`meta.slaTarget` on every P1 `support.requested` event —
 * see `vantelisIT-be`'s `chargeDemandeSupport`). HQ's own P1 response
 * commitment for that brand should be at least as tight as what's already
 * being told to the client. Resolution target and every other
 * brand/priority stay null pending an actual decision — see
 * `SlaPolicies1789100000000`'s seeding for why a null target reads as
 * "tracked, not yet configured" rather than absent.
 */
export class SeedVantelisP1SlaTarget1789400000000 implements MigrationInterface {
  name = 'SeedVantelisP1SlaTarget1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "sla_policies" SET "response_target_minutes" = 15, "updated_at" = now() ` +
        `WHERE "priority" = 'P1' AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'vantelis-it')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "sla_policies" SET "response_target_minutes" = NULL, "updated_at" = now() ` +
        `WHERE "priority" = 'P1' AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'vantelis-it')`,
    );
  }
}
