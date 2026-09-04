import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lot 1.1 — the registry of execution references (EXE-01).
 *
 * Two tables: the reference is the identity, the version holds the document.
 * Nothing about a version is updatable, so the schema carries the guarantee
 * rather than trusting the service to remember it:
 *
 *  - `UQ_execution_reference_versions_ref_version` makes re-sending the same
 *    version number a database-level conflict, which is what "the original is
 *    never silently replaced" means in practice;
 *  - `content_hash` is indexed so the service can spot identical content under
 *    a new number without scanning the corpus;
 *  - `latest_version_id` has no FK on purpose — a circular constraint between
 *    the two tables would make insertion order load-bearing for no benefit.
 */
export class ExecutionReferences1790600000000 implements MigrationInterface {
  name = 'ExecutionReferences1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "execution_references" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"key" character varying(64) NOT NULL, ` +
        `"title" character varying(200) NOT NULL, ` +
        `"domain_id" uuid, ` +
        `"product_id" uuid, ` +
        `"project_id" uuid, ` +
        `"origin" character varying(24) NOT NULL DEFAULT 'internal', ` +
        `"owner" character varying(160) NOT NULL, ` +
        `"latest_version_id" uuid, ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_execution_references" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_execution_references_key" UNIQUE ("key"), ` +
        `CONSTRAINT "FK_execution_references_domain" FOREIGN KEY ("domain_id") ` +
        `REFERENCES "domains"("id") ON DELETE SET NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_references_domain_id" ON "execution_references" ("domain_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "execution_reference_versions" (` +
        `"id" uuid NOT NULL DEFAULT gen_random_uuid(), ` +
        `"reference_id" uuid NOT NULL, ` +
        `"version" character varying(32) NOT NULL, ` +
        `"status" character varying(24) NOT NULL DEFAULT 'received', ` +
        `"format" character varying(16) NOT NULL, ` +
        `"content" text NOT NULL, ` +
        `"content_hash" character varying(64) NOT NULL, ` +
        `"size_bytes" integer NOT NULL, ` +
        `"received_from" character varying(160) NOT NULL, ` +
        `"received_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"effective_date" date, ` +
        `"published_by" character varying(160), ` +
        `"published_at" TIMESTAMP, ` +
        `CONSTRAINT "PK_execution_reference_versions" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_execution_reference_versions_ref_version" UNIQUE ("reference_id", "version"), ` +
        `CONSTRAINT "FK_execution_reference_versions_reference" FOREIGN KEY ("reference_id") ` +
        `REFERENCES "execution_references"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_reference_versions_reference_id" ` +
        `ON "execution_reference_versions" ("reference_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_reference_versions_content_hash" ` +
        `ON "execution_reference_versions" ("content_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_execution_reference_versions_status" ` +
        `ON "execution_reference_versions" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_reference_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "execution_references"`);
  }
}
