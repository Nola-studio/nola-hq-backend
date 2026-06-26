import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand-only, backward-compatible migration.
 *
 *   1. Creates `module_overrides` — the HQ override layer for app
 *      feature-modules (read merges this with each app manifest; same
 *      pattern as `plans` against nola-billing). New table → no data risk.
 *
 *   2. Adds `sent_count` + `send_error` to `broadcasts` so a real dispatch
 *      can record how many recipients it published to and any failure.
 *      Both columns are nullable / defaulted → existing rows keep working
 *      (NULL/0 = "never dispatched / no error").
 *
 * `down` drops the additions only. No existing column or row is touched, so
 * the rollback is safe and lossless for pre-existing data.
 */
export class ModulesAndBroadcastDispatch1782440311000
  implements MigrationInterface
{
  name = 'ModulesAndBroadcastDispatch1782440311000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── module_overrides ──────────────────────────────────────────────
    await queryRunner.query(
      `CREATE TABLE "module_overrides" (` +
        `"id" character varying NOT NULL, ` +
        `"app" character varying NOT NULL, ` +
        `"module_id" character varying NOT NULL, ` +
        `"label" character varying, ` +
        `"is_default" boolean, ` +
        `"beta" boolean, ` +
        `"manually_edited" boolean NOT NULL DEFAULT false, ` +
        `"manifest_backed" boolean NOT NULL DEFAULT true, ` +
        `"updated_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_module_overrides_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_module_overrides_app" ON "module_overrides" ("app")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_module_overrides_app_module" ON "module_overrides" ("app", "module_id")`,
    );

    // ── broadcasts dispatch tracking ──────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "broadcasts" ADD "sent_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "broadcasts" ADD "send_error" character varying(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "broadcasts" DROP COLUMN "send_error"`);
    await queryRunner.query(`ALTER TABLE "broadcasts" DROP COLUMN "sent_count"`);

    await queryRunner.query(`DROP INDEX "public"."IDX_module_overrides_app_module"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_module_overrides_app"`);
    await queryRunner.query(`DROP TABLE "module_overrides"`);
  }
}
