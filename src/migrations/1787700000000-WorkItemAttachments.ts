import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Metadata table for ticket attachments — the files themselves live on a
 * Railway volume (`ATTACHMENTS_DIR`), not in Postgres. See
 * `work-item-attachment.entity.ts` for why the on-disk name is never
 * derived from user input.
 */
export class WorkItemAttachments1787700000000 implements MigrationInterface {
  name = 'WorkItemAttachments1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "work_item_attachments" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"work_item_id" integer NOT NULL, ` +
        `"original_name" character varying(255) NOT NULL, ` +
        `"mime_type" character varying(120) NOT NULL, ` +
        `"size_bytes" integer NOT NULL, ` +
        `"uploaded_by" character varying(160) NOT NULL, ` +
        `"created_at" TIMESTAMP NOT NULL, ` +
        `CONSTRAINT "PK_work_item_attachments_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_work_item_attachments_work_item_id" ON "work_item_attachments" ("work_item_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_item_attachments" ADD CONSTRAINT "FK_work_item_attachments_work_item_id" ` +
        `FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "work_item_attachments"`);
  }
}
