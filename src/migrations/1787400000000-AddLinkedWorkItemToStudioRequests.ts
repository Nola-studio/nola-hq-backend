import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an operator convert an accepted `StudioRequest` into a ticket
 * (`WorkItem`, surfaced to the frontend as a `StudioTask`), keeping a link
 * back to the originating request. `work_items.id` is an integer PK, unlike
 * `studio_requests.id` (uuid) — hence the plain `integer` column here rather
 * than a uuid FK. `ON DELETE SET NULL`: deleting the ticket never deletes
 * the request, it just un-links it.
 */
export class AddLinkedWorkItemToStudioRequests1787400000000 implements MigrationInterface {
  name = 'AddLinkedWorkItemToStudioRequests1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "studio_requests" ADD COLUMN "linked_work_item_id" integer`);
    await queryRunner.query(
      `CREATE INDEX "IDX_studio_requests_linked_work_item" ON "studio_requests" ("linked_work_item_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "studio_requests" ADD CONSTRAINT "FK_studio_requests_linked_work_item" ` +
        `FOREIGN KEY ("linked_work_item_id") REFERENCES "work_items"("id") ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "studio_requests" DROP CONSTRAINT "FK_studio_requests_linked_work_item"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_studio_requests_linked_work_item"`);
    await queryRunner.query(`ALTER TABLE "studio_requests" DROP COLUMN "linked_work_item_id"`);
  }
}
