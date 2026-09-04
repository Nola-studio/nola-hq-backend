import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-brand, per-priority SLA targets. Deliberately keyed on
 * (business_unit_id, priority), not global — a Vantelis MSP outage and a
 * Yekoli billing question are not the same clock. Response and resolution
 * are separate nullable columns: a row existing with a null target means
 * "tracked, not yet configured"; the row being absent entirely means
 * "not tracked at all" — the two must stay visibly distinguishable, so a
 * missing row is never treated as "use some default."
 *
 * Seeds one P1/P2/P3 row (all targets null) per existing business unit, so
 * every current brand starts in the "tracked, unconfigured" state rather
 * than "absent". Brand creation going forward does the same seeding in
 * application code (`CompanyService.createBusinessUnit`).
 */
export class SlaPolicies1789100000000 implements MigrationInterface {
  name = 'SlaPolicies1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sla_policies" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"business_unit_id" uuid NOT NULL, ` +
        `"priority" character varying NOT NULL, ` +
        `"response_target_minutes" integer, ` +
        `"resolution_target_minutes" integer, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "UQ_sla_policies_business_unit_priority" UNIQUE ("business_unit_id", "priority"), ` +
        `CONSTRAINT "PK_sla_policies" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_sla_policies_business_unit" ON "sla_policies" ("business_unit_id")`);
    await queryRunner.query(
      `ALTER TABLE "sla_policies" ADD CONSTRAINT "FK_sla_policies_business_unit" ` +
        `FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `INSERT INTO "sla_policies" ("business_unit_id", "priority", "created_at", "updated_at") ` +
        `SELECT "id", "priority", now(), now() FROM "business_units" ` +
        `CROSS JOIN (VALUES ('P1'), ('P2'), ('P3')) AS p("priority")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sla_policies" DROP CONSTRAINT "FK_sla_policies_business_unit"`);
    await queryRunner.query(`DROP INDEX "IDX_sla_policies_business_unit"`);
    await queryRunner.query(`DROP TABLE "sla_policies"`);
  }
}
