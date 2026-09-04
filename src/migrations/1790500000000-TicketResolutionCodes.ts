import { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketResolutionCodes1790500000000 implements MigrationInterface {
  name = 'TicketResolutionCodes1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_code" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "resolution_notes" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "resolution_notes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP COLUMN IF EXISTS "resolution_code"`,
    );
  }
}

