import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First real SLA targets for all three brands, all nine (business unit,
 * priority) rows seeded by SlaPolicies1789100000000. Resolved by `code`
 * (never a hardcoded UUID), same convention as every other seed migration
 * here (e.g. SeedBusinessUnitThemes1788600000000).
 *
 * vantelis-it P1 response is left untouched — SeedVantelisP1SlaTarget
 * already set it to 15 minutes, matching what the Vantelis IT portal
 * promises its own clients. Only its resolution target is set here.
 * nolaa-corp P3 resolution stays null — no commitment defined yet for
 * that band, same "tracked, not yet configured" state the table started
 * in.
 *
 * Postgres-only — SQLite dev keeps `synchronize: true` and never runs
 * migrations (see src/data-source.ts).
 */
export class SeedSlaTargets1789800000000 implements MigrationInterface {
  name = 'SeedSlaTargets1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const set = async (code: string, priority: string, response: number | null, resolution: number | null) => {
      const parts: string[] = [];
      if (response !== undefined) parts.push(`"response_target_minutes" = ${response === null ? 'NULL' : response}`);
      if (resolution !== undefined) parts.push(`"resolution_target_minutes" = ${resolution === null ? 'NULL' : resolution}`);
      await queryRunner.query(
        `UPDATE "sla_policies" SET ${parts.join(', ')}, "updated_at" = now() ` +
          `WHERE "priority" = '${priority}' AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = '${code}')`,
      );
    };

    // vantelis-it — P1 response already 15 (SeedVantelisP1SlaTarget), resolution only.
    await queryRunner.query(
      `UPDATE "sla_policies" SET "resolution_target_minutes" = 240, "updated_at" = now() ` +
        `WHERE "priority" = 'P1' AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = 'vantelis-it')`,
    );
    await set('vantelis-it', 'P2', 60, 1440);
    await set('vantelis-it', 'P3', 240, 4320);

    await set('khi-lab', 'P1', 60, 480);
    await set('khi-lab', 'P2', 240, 2880);
    await set('khi-lab', 'P3', 1440, 7200);

    await set('nolaa-corp', 'P1', 240, 2880);
    await set('nolaa-corp', 'P2', 1440, 7200);
    await set('nolaa-corp', 'P3', 4320, null);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const clear = async (code: string, priority: string, clearResponse: boolean, clearResolution: boolean) => {
      const parts: string[] = [];
      if (clearResponse) parts.push(`"response_target_minutes" = NULL`);
      if (clearResolution) parts.push(`"resolution_target_minutes" = NULL`);
      if (parts.length === 0) return;
      await queryRunner.query(
        `UPDATE "sla_policies" SET ${parts.join(', ')}, "updated_at" = now() ` +
          `WHERE "priority" = '${priority}' AND "business_unit_id" = (SELECT "id" FROM "business_units" WHERE "code" = '${code}')`,
      );
    };

    // vantelis-it P1 response is not this migration's to clear — it predates it.
    await clear('vantelis-it', 'P1', false, true);
    await clear('vantelis-it', 'P2', true, true);
    await clear('vantelis-it', 'P3', true, true);

    await clear('khi-lab', 'P1', true, true);
    await clear('khi-lab', 'P2', true, true);
    await clear('khi-lab', 'P3', true, true);

    await clear('nolaa-corp', 'P1', true, true);
    await clear('nolaa-corp', 'P2', true, true);
    await clear('nolaa-corp', 'P3', true, false);
  }
}
