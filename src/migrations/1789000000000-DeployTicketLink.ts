import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Links a Deploy log row to the `deployment`-category ticket that approved
 * it — the new prod-promotion process: HQ records via this link, GitHub
 * enforces the actual gate on the PR. Nullable/SET NULL: most deploys
 * (dev, or anything predating this process) have no ticket, and a deploy
 * log must never be blocked or retroactively altered by ticket lifecycle.
 */
export class DeployTicketLink1789000000000 implements MigrationInterface {
  name = 'DeployTicketLink1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deploys" ADD COLUMN "ticket_id" integer`);
    await queryRunner.query(`CREATE INDEX "IDX_deploys_ticket_id" ON "deploys" ("ticket_id")`);
    await queryRunner.query(
      `ALTER TABLE "deploys" ADD CONSTRAINT "FK_deploys_ticket" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deploys" DROP CONSTRAINT "FK_deploys_ticket"`);
    await queryRunner.query(`DROP INDEX "IDX_deploys_ticket_id"`);
    await queryRunner.query(`ALTER TABLE "deploys" DROP COLUMN "ticket_id"`);
  }
}
