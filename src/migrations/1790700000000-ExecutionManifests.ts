import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lot 1.2 — Execution Manifests (EXE-04), plus the columns a work item needs
 * to be placed and traced (EXE-05, EXE-07).
 *
 * `work_items` gains:
 *  - `parent_id`, so an epic can hold its stories;
 *  - the `source_*` provenance, so "why does this backlog item exist?" has an
 *    answer that does not depend on someone remembering;
 *  - `epic`, `story` and `spike` types, and the `triage` status, which are
 *    plain varchar columns — nothing to alter, only meaning to add.
 *
 * `IDX_work_items_source` is the reconciliation index: re-importing a
 * reference looks every item up by `(source_kind, source_key)`, and without it
 * that is a sequential scan per item across the whole backlog.
 */
export class ExecutionManifests1790700000000 implements MigrationInterface {
  name = 'ExecutionManifests1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "execution_manifests" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"version_id" uuid NOT NULL, ` +
        `"schema_version" character varying(8) NOT NULL DEFAULT '1', ` +
        `"issues" text NOT NULL DEFAULT '[]', ` +
        `"parsed_by" character varying(160) NOT NULL, ` +
        `"parsed_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_execution_manifests" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_execution_manifests_version" UNIQUE ("version_id"), ` +
        `CONSTRAINT "FK_execution_manifests_version" FOREIGN KEY ("version_id") ` +
        `REFERENCES "execution_reference_versions"("id") ON DELETE CASCADE)`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "execution_manifest_items" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"manifest_id" uuid NOT NULL, ` +
        `"kind" character varying(16) NOT NULL, ` +
        `"source_key" character varying(64) NOT NULL, ` +
        `"parent_key" character varying(64), ` +
        `"title" character varying(300) NOT NULL, ` +
        `"body" text, ` +
        `"priority" character varying(4), ` +
        `"source_section_id" character varying(200) NOT NULL, ` +
        `"source_excerpt_hash" character varying(64) NOT NULL, ` +
        `"source_line" integer NOT NULL, ` +
        `CONSTRAINT "PK_execution_manifest_items" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "FK_execution_manifest_items_manifest" FOREIGN KEY ("manifest_id") ` +
        `REFERENCES "execution_manifests"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_manifest_items_manifest_id" ` +
        `ON "execution_manifest_items" ("manifest_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_manifest_items_source_key" ` +
        `ON "execution_manifest_items" ("source_key")`,
    );

    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "parent_id" integer NULL ` +
        `REFERENCES "work_items"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_work_items_parent_id" ON "work_items" ("parent_id")`);

    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "source_kind" character varying(16) NOT NULL DEFAULT 'manual'`,
    );
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "source_ref_id" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "source_key" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "source_author" character varying(160)`);
    await queryRunner.query(
      `ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "source_excerpt_hash" character varying(64)`,
    );
    await queryRunner.query(`ALTER TABLE "work_items" ADD COLUMN IF NOT EXISTS "approved_by" character varying(160)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_work_items_source" ON "work_items" ("source_kind", "source_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_work_items_source"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_work_items_parent_id"`);
    for (const column of [
      'approved_by',
      'source_excerpt_hash',
      'source_author',
      'source_key',
      'source_ref_id',
      'source_kind',
      'parent_id',
    ]) {
      await queryRunner.query(`ALTER TABLE "work_items" DROP COLUMN IF EXISTS "${column}"`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_manifest_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_manifests"`);
  }
}
